"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifySession } from "@/lib/dal";
import { logEvent } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CreateTodoSchema = z.object({
  title: z.string().min(1, "Title is required").trim(),
  description: z.string().trim().optional().or(z.literal("")),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  dueAt: z.string().optional().or(z.literal("")),
  leadId: z.string().uuid().optional().or(z.literal("")),
});

const UpdateTodoSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).trim().optional(),
  description: z.string().trim().optional().or(z.literal("")),
  priority: z.enum(["low", "medium", "high"]).optional(),
  dueAt: z.string().optional().or(z.literal("")),
  leadId: z.string().uuid().optional().or(z.literal("")),
});

const CreateNoteSchema = z.object({
  title: z.string().min(1, "Title is required").trim(),
  body: z.string().trim().optional().or(z.literal("")),
  leadId: z.string().uuid().optional().or(z.literal("")),
});

const UpdateNoteSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).trim().optional(),
  body: z.string().trim().optional(),
  pinned: z.boolean().optional(),
});

export type TaskFormState = {
  errors?: Record<string, string[]>;
  message?: string;
  ok?: boolean;
};

// ---------------------------------------------------------------------------
// To-do CRUD
// ---------------------------------------------------------------------------

export async function createTodo(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const parsed = CreateTodoSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    priority: formData.get("priority") || "medium",
    dueAt: formData.get("dueAt"),
    leadId: formData.get("leadId"),
  });
  if (!parsed.success) {
    return {
      errors: parsed.error.issues.reduce<Record<string, string[]>>((acc, i) => {
        const key = i.path[0]?.toString() ?? "_";
        (acc[key] ??= []).push(i.message);
        return acc;
      }, {}),
    };
  }

  const { title, description, priority, dueAt, leadId } = parsed.data;
  const due = dueAt ? new Date(dueAt) : null;
  if (dueAt && (!due || isNaN(due.getTime()))) {
    return { errors: { dueAt: ["Invalid date"] } };
  }

  const [todo] = await db
    .insert(schema.todos)
    .values({
      orgId: ctx.orgId,
      userId: ctx.userId,
      title,
      description: description || null,
      priority,
      dueAt: due,
      leadId: leadId || null,
    })
    .returning();

  await logEvent(ctx.orgId, "todo_created", {
    leadId: leadId || undefined,
    actorId: ctx.userId,
    meta: { todoId: todo.id, title, priority, dueAt: due?.toISOString() ?? null },
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  if (leadId) revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function completeTodo(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const todoId = String(formData.get("id"));
  const [todo] = await db
    .update(schema.todos)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(schema.todos.id, todoId), eq(schema.todos.orgId, ctx.orgId), eq(schema.todos.userId, ctx.userId)),
    )
    .returning();

  if (!todo) return { message: "To-do not found" };

  await logEvent(ctx.orgId, "todo_completed", {
    leadId: todo.leadId ?? undefined,
    actorId: ctx.userId,
    meta: { todoId: todo.id },
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  if (todo.leadId) revalidatePath(`/leads/${todo.leadId}`);
  return { ok: true };
}

export async function reopenTodo(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const todoId = String(formData.get("id"));
  const [todo] = await db
    .update(schema.todos)
    .set({ status: "pending", completedAt: null, updatedAt: new Date() })
    .where(
      and(eq(schema.todos.id, todoId), eq(schema.todos.orgId, ctx.orgId), eq(schema.todos.userId, ctx.userId)),
    )
    .returning();

  if (!todo) return { message: "To-do not found" };

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteTodo(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const todoId = String(formData.get("id"));
  await db
    .delete(schema.todos)
    .where(
      and(eq(schema.todos.id, todoId), eq(schema.todos.orgId, ctx.orgId), eq(schema.todos.userId, ctx.userId)),
    );

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Note CRUD
// ---------------------------------------------------------------------------

export async function createNote(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const parsed = CreateNoteSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    leadId: formData.get("leadId"),
  });
  if (!parsed.success) {
    return {
      errors: parsed.error.issues.reduce<Record<string, string[]>>((acc, i) => {
        const key = i.path[0]?.toString() ?? "_";
        (acc[key] ??= []).push(i.message);
        return acc;
      }, {}),
    };
  }

  const { title, body, leadId } = parsed.data;

  const [note] = await db
    .insert(schema.notes)
    .values({
      orgId: ctx.orgId,
      userId: ctx.userId,
      title,
      body: body || "",
      leadId: leadId || null,
    })
    .returning();

  await logEvent(ctx.orgId, "note_created", {
    leadId: leadId || undefined,
    actorId: ctx.userId,
    meta: { noteId: note.id, title },
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  if (leadId) revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function updateNote(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const id = String(formData.get("id"));
  const title = String(formData.get("title") || "");
  const body = String(formData.get("body") || "");
  const pinned = formData.get("pinned") === "true";

  if (!title) return { errors: { title: ["Title is required"] } };

  const [note] = await db
    .update(schema.notes)
    .set({ title, body, pinned, updatedAt: new Date() })
    .where(
      and(eq(schema.notes.id, id), eq(schema.notes.orgId, ctx.orgId), eq(schema.notes.userId, ctx.userId)),
    )
    .returning();

  if (!note) return { message: "Note not found" };

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteNote(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const noteId = String(formData.get("id"));
  await db
    .delete(schema.notes)
    .where(
      and(eq(schema.notes.id, noteId), eq(schema.notes.orgId, ctx.orgId), eq(schema.notes.userId, ctx.userId)),
    );

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function toggleNotePin(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const noteId = String(formData.get("id"));
  const [note] = await db
    .select()
    .from(schema.notes)
    .where(
      and(eq(schema.notes.id, noteId), eq(schema.notes.orgId, ctx.orgId), eq(schema.notes.userId, ctx.userId)),
    )
    .limit(1);

  if (!note) return { message: "Note not found" };

  await db
    .update(schema.notes)
    .set({ pinned: !note.pinned, updatedAt: new Date() })
    .where(eq(schema.notes.id, noteId));

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { ok: true };
}
