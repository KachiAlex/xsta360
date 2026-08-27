import { requireAuth } from "@/lib/dal";
import { getUserTodos, getUserNotes } from "@/lib/tasks";
import { Topbar } from "@/components/app/topbar";
import { TodoList } from "@/components/app/todo-list";
import { NoteList } from "@/components/app/note-list";
import { Panel } from "@/components/ui/panel";

export default async function TasksPage() {
  const ctx = await requireAuth();
  const [todos, notes] = await Promise.all([
    getUserTodos(ctx.orgId, ctx.userId),
    getUserNotes(ctx.orgId, ctx.userId),
  ]);

  return (
    <>
      <Topbar searchPlaceholder="Search to-dos & notes...">
        <span className="px-4 py-2 text-[13.5px] font-semibold bg-panel text-ink rounded shadow-[0_1px_0_var(--color-rule)]">
          To-Dos &amp; Notes
        </span>
      </Topbar>

      <div className="content flex-1 px-8 py-7 max-w-[1240px] w-full mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* To-Dos */}
          <Panel>
            <div className="p-5">
              <TodoList todos={todos} />
            </div>
          </Panel>

          {/* Notes */}
          <Panel>
            <div className="p-5">
              <NoteList notes={notes} />
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
