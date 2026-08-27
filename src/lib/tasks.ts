import "server-only";
import { and, desc, eq, lte } from "drizzle-orm";
import { db, schema } from "@/db";

export interface TodoRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueAt: Date | null;
  completedAt: Date | null;
  leadId: string | null;
  leadName: string | null;
  leadCompany: string | null;
  createdAt: Date;
}

export interface NoteRow {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  leadId: string | null;
  leadName: string | null;
  leadCompany: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getUserTodos(orgId: string, userId: string): Promise<TodoRow[]> {
  const todos = await db
    .select({
      id: schema.todos.id,
      title: schema.todos.title,
      description: schema.todos.description,
      status: schema.todos.status,
      priority: schema.todos.priority,
      dueAt: schema.todos.dueAt,
      completedAt: schema.todos.completedAt,
      leadId: schema.todos.leadId,
      leadName: schema.leads.name,
      leadCompany: schema.leads.company,
      createdAt: schema.todos.createdAt,
    })
    .from(schema.todos)
    .leftJoin(schema.leads, eq(schema.leads.id, schema.todos.leadId))
    .where(
      and(eq(schema.todos.orgId, orgId), eq(schema.todos.userId, userId)),
    )
    .orderBy(desc(schema.todos.createdAt));

  return todos;
}

export async function getUserNotes(orgId: string, userId: string): Promise<NoteRow[]> {
  const notes = await db
    .select({
      id: schema.notes.id,
      title: schema.notes.title,
      body: schema.notes.body,
      pinned: schema.notes.pinned,
      leadId: schema.notes.leadId,
      leadName: schema.leads.name,
      leadCompany: schema.leads.company,
      createdAt: schema.notes.createdAt,
      updatedAt: schema.notes.updatedAt,
    })
    .from(schema.notes)
    .leftJoin(schema.leads, eq(schema.leads.id, schema.notes.leadId))
    .where(
      and(eq(schema.notes.orgId, orgId), eq(schema.notes.userId, userId)),
    )
    .orderBy(desc(schema.notes.pinned), desc(schema.notes.updatedAt));

  return notes;
}

// Dashboard summary: pending todos due today/overdue + pinned/recent notes
export interface TaskSummary {
  todosDueToday: number;
  todosOverdue: number;
  todosPending: number;
  recentTodos: TodoRow[];
  pinnedNotes: NoteRow[];
  recentNotes: NoteRow[];
}

export async function getTaskSummary(orgId: string, userId: string): Promise<TaskSummary> {
  const now = new Date();
  const sod = new Date(now);
  sod.setHours(0, 0, 0, 0);
  const eod = new Date(now);
  eod.setHours(23, 59, 59, 999);

  const allTodos = await getUserTodos(orgId, userId);
  const pending = allTodos.filter((t) => t.status === "pending");
  const overdue = pending.filter((t) => t.dueAt && t.dueAt < sod).length;
  const dueToday = pending.filter((t) => t.dueAt && t.dueAt >= sod && t.dueAt <= eod).length;

  const allNotes = await getUserNotes(orgId, userId);
  const pinnedNotes = allNotes.filter((n) => n.pinned);
  const recentNotes = allNotes.filter((n) => !n.pinned).slice(0, 3);

  return {
    todosDueToday: dueToday,
    todosOverdue: overdue,
    todosPending: pending.length,
    recentTodos: pending.slice(0, 5),
    pinnedNotes,
    recentNotes,
  };
}
