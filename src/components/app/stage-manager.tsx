"use client";

import { useActionState, useTransition } from "react";
import { addStage, updateStage, deleteStage, type OrgFormState } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";

export function StageManager({
  stages,
}: {
  stages: { id: string; name: string; kind: string; position: number }[];
}) {
  const [state, action, pending] = useActionState<OrgFormState, FormData>(addStage, {});
  const [, startTransition] = useTransition();

  return (
    <div>
      <ul className="divide-y divide-dashed divide-rule">
        {stages.map((s) => (
          <li key={s.id} className="px-5 py-3 flex items-center gap-3">
            <span className="font-mono text-xs text-ink-soft w-6">{s.position}</span>
            <input
              defaultValue={s.name}
              className="text-sm border border-rule bg-paper rounded px-2 py-1 flex-1"
              onChange={(e) => {
                const fd = new FormData();
                fd.set("stageId", s.id);
                fd.set("name", e.currentTarget.value);
                startTransition(async () => {
                  await updateStage({}, fd);
                });
              }}
            />
            <span className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">{s.kind}</span>
            <button
              type="button"
              className="text-xs text-stamp hover:underline"
              onClick={() => {
                const fd = new FormData();
                fd.set("stageId", s.id);
                startTransition(async () => {
                  await deleteStage({}, fd);
                });
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      <form action={action} className="px-5 py-4 border-t border-rule flex gap-2 items-end flex-wrap">
        <div>
          <Label>Stage name</Label>
          <Input name="name" placeholder="e.g. Qualified" className="w-auto" />
          {state.errors?.name && <p className="text-xs text-stamp mt-1">{state.errors.name[0]}</p>}
        </div>
        <div>
          <Label>Type</Label>
          <Select name="kind" defaultValue="open" className="w-auto">
            <option value="open">Open</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </Select>
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Adding…" : "Add stage"}
        </Button>
        {state.message && <p className="text-xs text-stamp w-full">{state.message}</p>}
      </form>
    </div>
  );
}
