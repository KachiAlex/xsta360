"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { createTodo, completeTodo, reopenTodo, deleteTodo, type TaskFormState } from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import { Label, Input, Textarea, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import type { TodoRow } from "@/lib/tasks";

const PRIORITY_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_TONES: Record<string, "overdue" | "today" | "neutral"> = {
  high: "overdue",
  medium: "today",
  low: "neutral",
};

function formatDue(d: Date | null): string {
  if (!d) return "";
  const now = new Date();
  const sod = new Date(now);
  sod.setHours(0, 0, 0, 0);
  const diff = d.getTime() - sod.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (d < sod) {
    const overdueDays = Math.abs(days);
    return overdueDays === 0 ? "Overdue" : `${overdueDays}d overdue`;
  }
  if (days === 0) return `Today, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  if (days === 1) return "Tomorrow";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(d: Date | null): boolean {
  if (!d) return false;
  const sod = new Date();
  sod.setHours(0, 0, 0, 0);
  return d < sod;
}

export function TodoList({ todos, leadId }: { todos: TodoRow[]; leadId?: string }) {
  const [showForm, setShowForm] = useState(false);
  const [state, action, pending] = useActionState<TaskFormState, FormData>(createTodo, {});

  const visible = showForm && !state.ok;
  const pending_todos = todos.filter((t) => t.status === "pending");
  const completed_todos = todos.filter((t) => t.status === "completed");

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="font-mono text-base font-bold m-0">To-Dos</h2>
        <span className="text-xs text-ink-soft font-mono">
          {pending_todos.length} pending · {completed_todos.length} done
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setShowForm(true)}
        >
          + Add to-do
        </Button>
      </div>

      {visible && (
        <form action={action} className="bg-paper-2 border border-rule rounded p-4 mb-4 space-y-3">
          {leadId && <input type="hidden" name="leadId" value={leadId} />}
          <div>
            <Label>What needs to be done?</Label>
            <Input name="title" placeholder="e.g. Send revised quote to Adaeze" autoFocus />
            {state.errors?.title && <p className="text-xs text-stamp mt-1">{state.errors.title[0]}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
              <Select name="priority" defaultValue="medium">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </Select>
            </div>
            <div>
              <Label>Due date (optional)</Label>
              <Input name="dueAt" type="datetime-local" />
            </div>
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea name="description" rows={2} placeholder="Additional context…" />
          </div>
          {state.message && (
            <p className="text-sm text-stamp bg-stamp/10 px-3 py-2 rounded">{state.message}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Adding…" : "Add to-do"}
            </Button>
          </div>
        </form>
      )}

      {/* Pending todos */}
      {pending_todos.length > 0 && (
        <div className="space-y-2 mb-4">
          {pending_todos.map((todo) => (
            <TodoItem key={todo.id} todo={todo} />
          ))}
        </div>
      )}

      {/* Completed todos */}
      {completed_todos.length > 0 && (
        <details className="mt-4">
          <summary className="text-xs font-mono text-ink-soft cursor-pointer hover:text-ink">
            Completed ({completed_todos.length})
          </summary>
          <div className="space-y-2 mt-2">
            {completed_todos.map((todo) => (
              <TodoItem key={todo.id} todo={todo} />
            ))}
          </div>
        </details>
      )}

      {todos.length === 0 && !visible && (
        <div className="text-sm text-ink-soft py-8 text-center bg-paper-2 border border-dashed border-rule rounded">
          No to-dos yet. Click &quot;Add to-do&quot; to create one.
        </div>
      )}
    </div>
  );
}

function TodoItem({ todo }: { todo: TodoRow }) {
  const [, startTransition] = useTransition();
  const isDone = todo.status === "completed";

  return (
    <div className={`flex items-start gap-2.5 sm:gap-3 p-3 bg-panel border border-rule rounded ${isDone ? "opacity-60" : ""}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            await (isDone ? reopenTodo : completeTodo)({}, fd);
          });
        }}
      >
        <input type="hidden" name="id" value={todo.id} />
        <button
          type="submit"
          className={`mt-0.5 w-4 h-4 rounded-[3px] border-[1.5px] border-ink shrink-0 flex items-center justify-center cursor-pointer ${
            isDone ? "bg-ink text-paper" : "bg-transparent hover:bg-paper-2"
          }`}
        >
          {isDone && "✓"}
        </button>
      </form>

      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${isDone ? "line-through" : ""}`}>
          {todo.title}
        </div>
        {todo.description && (
          <div className="text-xs text-ink-soft mt-0.5">{todo.description}</div>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <Badge tone={PRIORITY_TONES[todo.priority] ?? "neutral"}>
            {PRIORITY_LABELS[todo.priority] ?? todo.priority}
          </Badge>
          {todo.dueAt && (
            <Badge tone={isOverdue(todo.dueAt) && !isDone ? "overdue" : "neutral"}>
              {formatDue(todo.dueAt)}
            </Badge>
          )}
          {todo.leadName && (
            <Link
              href={`/leads/${todo.leadId}`}
              className="text-[11px] text-ink-soft hover:text-ink underline underline-offset-2"
            >
              {todo.leadName}{todo.leadCompany ? ` · ${todo.leadCompany}` : ""}
            </Link>
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            await deleteTodo({}, fd);
          });
        }}
      >
        <input type="hidden" name="id" value={todo.id} />
        <button
          type="submit"
          className="text-xs text-ink-soft hover:text-stamp transition-colors"
          title="Delete"
        >
          ✕
        </button>
      </form>
    </div>
  );
}
