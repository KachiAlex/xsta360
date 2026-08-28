"use client";

import { useActionState, useTransition, useRef, useEffect } from "react";
import { addStage, updateStage, deleteStage, updateStageProbability, type OrgFormState } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";

export function StageManager({
  stages,
}: {
  stages: { id: string; name: string; kind: string; position: number; probability: number }[];
}) {
  const [state, action, pending] = useActionState<OrgFormState, FormData>(addStage, {});
  const [, startTransition] = useTransition();

  return (
    <div>
      <ul className="divide-y divide-dashed divide-rule">
        {stages.map((s) => (
          <li key={s.id} className="px-4 sm:px-5 py-3 flex items-center gap-2 sm:gap-3 flex-wrap">
            <span className="font-mono text-xs text-ink-soft w-6">{s.position}</span>
            <DebouncedInput
              key={`name-${s.id}`}
              defaultValue={s.name}
              className="text-sm border border-rule bg-paper rounded px-3 py-2 flex-1 min-w-[120px] min-h-[40px]"
              onDebounce={(value) => {
                const fd = new FormData();
                fd.set("stageId", s.id);
                fd.set("name", value);
                startTransition(async () => {
                  await updateStage({}, fd);
                });
              }}
            />
            {/* Probability input */}
            <div className="flex items-center gap-1">
              <DebouncedInput
                key={`prob-${s.id}`}
                type="number"
                min={0}
                max={100}
                defaultValue={String(s.probability)}
                className="text-sm border border-rule bg-paper rounded px-2 py-2 w-16 text-right min-h-[40px]"
                title="Win probability %"
                onDebounce={(value) => {
                  const fd = new FormData();
                  fd.set("stageId", s.id);
                  fd.set("probability", value);
                  startTransition(async () => {
                    await updateStageProbability({}, fd);
                  });
                }}
              />
              <span className="text-xs text-ink-soft font-mono">%</span>
            </div>
            <span className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">{s.kind}</span>
            <button
              type="button"
              className="text-xs text-stamp hover:underline min-h-[36px] px-2 active:bg-stamp/10 rounded"
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

      <form action={action} className="px-4 sm:px-5 py-4 border-t border-rule flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <Label>Stage name</Label>
          <Input name="name" placeholder="e.g. Qualified" />
          {state.errors?.name && <p className="text-xs text-stamp mt-1">{state.errors.name[0]}</p>}
        </div>
        <div className="min-w-[120px]">
          <Label>Type</Label>
          <Select name="kind" defaultValue="open">
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

/** Input that debounces onChange before calling onDebounce. */
function DebouncedInput({
  onDebounce,
  className,
  defaultValue,
  type,
  min,
  max,
  title,
}: {
  onDebounce: (value: string) => void;
  className?: string;
  defaultValue?: string;
  type?: string;
  min?: number;
  max?: number;
  title?: string;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <input
      type={type}
      min={min}
      max={max}
      defaultValue={defaultValue}
      title={title}
      className={className}
      onChange={(e) => {
        const value = e.currentTarget.value;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          onDebounce(value);
        }, 600);
      }}
    />
  );
}
