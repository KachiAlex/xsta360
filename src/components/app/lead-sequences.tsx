"use client";

import { useState, useActionState } from "react";
import { enrollLead, unenrollLead, type SequenceFormState } from "@/app/actions/sequences";

export interface SequenceOption {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  stepCount: number;
}

export interface Enrollment {
  enrollmentId: string;
  sequenceId: string;
  sequenceName: string;
  status: string;
  currentStep: number;
  totalSteps: number;
  enrolledAt: string;
  completedAt: string | null;
}

export function LeadSequences({
  leadId,
  sequences,
  enrollments,
}: {
  leadId: string;
  sequences: SequenceOption[];
  enrollments: Enrollment[];
}) {
  const [state, formAction, pending] = useActionState<SequenceFormState, FormData>(
    enrollLead,
    {},
  );
  const [unenrollState, unenrollAction, unenrollPending] = useActionState<SequenceFormState, FormData>(
    unenrollLead,
    {},
  );
  const [showEnroll, setShowEnroll] = useState(false);

  const enrolledIds = new Set(enrollments.filter((e) => e.status === "active").map((e) => e.sequenceId));
  const availableSequences = sequences.filter((s) => s.active && !enrolledIds.has(s.id));

  return (
    <div className="space-y-3">
      {/* Active enrollments */}
      {enrollments.length > 0 ? (
        <ul className="space-y-2">
          {enrollments.map((e) => (
            <li key={e.enrollmentId} className="border border-rule rounded p-2.5 bg-paper">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{e.sequenceName}</div>
                  <div className="text-xs text-ink-soft mt-0.5">
                    {e.status === "active" && (
                      <>Step {e.currentStep + 1} of {e.totalSteps}</>
                    )}
                    {e.status === "completed" && <span className="text-register">✓ Completed</span>}
                    {e.status === "cancelled" && <span className="text-stamp">Cancelled</span>}
                  </div>
                </div>
                {e.status === "active" && (
                  <form action={unenrollAction}>
                    <input type="hidden" name="enrollmentId" value={e.enrollmentId} />
                    <button
                      type="submit"
                      disabled={unenrollPending}
                      className="text-xs text-stamp hover:underline disabled:opacity-50"
                    >
                      Unenroll
                    </button>
                  </form>
                )}
              </div>
              {/* Progress bar */}
              {e.status === "active" && e.totalSteps > 0 && (
                <div className="mt-2 h-1 bg-paper-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-register rounded-full transition-all"
                    style={{ width: `${((e.currentStep + 1) / e.totalSteps) * 100}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-soft">Not enrolled in any sequences.</p>
      )}

      {/* Enroll button / dropdown */}
      {availableSequences.length > 0 && (
        <div>
          {!showEnroll ? (
            <button
              type="button"
              onClick={() => setShowEnroll(true)}
              className="text-xs font-semibold text-ink hover:underline"
            >
              + Enroll in sequence
            </button>
          ) : (
            <form action={formAction} className="space-y-2">
              <input type="hidden" name="leadId" value={leadId} />
              <select
                name="sequenceId"
                className="w-full text-sm border border-rule bg-paper px-3 py-2 rounded font-mono"
                defaultValue=""
              >
                <option value="" disabled>Select a sequence...</option>
                {availableSequences.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.stepCount} steps)
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowEnroll(false)}
                  className="text-xs px-3 py-1.5 border border-rule rounded hover:bg-paper-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="text-xs px-3 py-1.5 bg-ink text-paper rounded hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Enrolling..." : "Enroll"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {state.message && (
        <p className={`text-xs ${state.ok ? "text-register" : "text-stamp"}`}>{state.message}</p>
      )}
      {unenrollState.message && (
        <p className={`text-xs ${unenrollState.ok ? "text-register" : "text-stamp"}`}>{unenrollState.message}</p>
      )}
    </div>
  );
}
