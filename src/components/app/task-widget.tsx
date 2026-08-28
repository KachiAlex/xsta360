import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { TaskSummary } from "@/lib/tasks";

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
  if (d < sod) return "Overdue";
  const eod = new Date(now);
  eod.setHours(23, 59, 59, 999);
  if (d <= eod) return "Today";
  const days = Math.floor((d.getTime() - sod.getTime()) / 86_400_000);
  if (days === 1) return "Tomorrow";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function TaskWidget({ summary }: { summary: TaskSummary }) {
  const hasTodos = summary.recentTodos.length > 0;
  const hasNotes = summary.pinnedNotes.length > 0 || summary.recentNotes.length > 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-rule border border-rule mb-5 sm:mb-7">
      {/* To-Dos summary */}
      <div className="bg-panel px-[22px] py-[18px]">
        <div className="flex items-center justify-between mb-3">
          <div className="label font-mono text-[11px] uppercase tracking-wider text-ink-soft font-semibold">
            To-Dos
          </div>
          <Link href="/tasks" className="text-[11px] font-semibold text-ink-soft hover:text-ink">
            View all →
          </Link>
        </div>
        <div className="flex gap-4 mb-3">
          <div>
            <span className="font-mono text-xl font-bold text-stamp">{summary.todosOverdue}</span>
            <span className="text-[11px] text-ink-soft ml-1">overdue</span>
          </div>
          <div>
            <span className="font-mono text-xl font-bold">{summary.todosDueToday}</span>
            <span className="text-[11px] text-ink-soft ml-1">today</span>
          </div>
          <div>
            <span className="font-mono text-xl font-bold text-ink-soft">{summary.todosPending}</span>
            <span className="text-[11px] text-ink-soft ml-1">pending</span>
          </div>
        </div>
        {hasTodos ? (
          <div className="space-y-1.5">
            {summary.recentTodos.slice(0, 3).map((todo) => (
              <div key={todo.id} className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-[3px] border-[1.5px] border-ink shrink-0" />
                <span className="flex-1 truncate">{todo.title}</span>
                {todo.dueAt && (
                  <Badge tone={PRIORITY_TONES[todo.priority] ?? "neutral"}>
                    {formatDue(todo.dueAt)}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-ink-soft">No pending to-dos.</div>
        )}
      </div>

      {/* Notes summary */}
      <div className="bg-panel px-[22px] py-[18px]">
        <div className="flex items-center justify-between mb-3">
          <div className="label font-mono text-[11px] uppercase tracking-wider text-ink-soft font-semibold">
            Notes
          </div>
          <Link href="/tasks" className="text-[11px] font-semibold text-ink-soft hover:text-ink">
            View all →
          </Link>
        </div>
        {hasNotes ? (
          <div className="space-y-2">
            {summary.pinnedNotes.slice(0, 2).map((note) => (
              <div key={note.id} className="text-xs">
                <div className="font-semibold flex items-center gap-1">
                  <span className="text-amber">📌</span>
                  <span className="truncate">{note.title}</span>
                </div>
                {note.body && (
                  <div className="text-ink-soft truncate ml-4">{note.body}</div>
                )}
              </div>
            ))}
            {summary.recentNotes.slice(0, 2 - summary.pinnedNotes.length).map((note) => (
              <div key={note.id} className="text-xs">
                <div className="font-semibold truncate">{note.title}</div>
                {note.body && (
                  <div className="text-ink-soft truncate">{note.body}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-ink-soft">No notes yet.</div>
        )}
      </div>
    </div>
  );
}
