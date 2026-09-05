"use client";

import { useState, useActionState } from "react";
import { enrollLead, unenrollLead, pauseEnrollment, resumeEnrollment, type SequenceFormState } from "@/app/actions/sequences";

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
  pausedReason: string | null;
  repliedAt: string | null;
  bouncedAt: string | null;
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
  const [, resumeAction] = useActionState<SequenceFormState, FormData>(
    resumeEnrollment,
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
                    {e.status === "paused" && (
                      <span className="text-amber-600">
                        ⏸ Paused
                        {e.pausedReason === "reply" && " — lead replied"}
                        {e.pausedReason === "bounce" && " — email bounced"}
                        {e.pausedReason === "unsubscribed" && " — unsubscribed"}
                        {e.pausedReason === "manual" && " — manual"}
                      </span>
                    )}
                    {e.repliedAt && <div className="text-register mt-0.5">↩ Replied {new Date(e.repliedAt).toLocaleDateString()}</div>}
                    {e.bouncedAt && <div className="text-stamp mt-0.5">⚠ Email bounced {new Date(e.bouncedAt).toLocaleDateString()}</div>}
                  </div>
                </div>
                {e.status === "active" && (
                  <form action={unenrollAction}>
                    <input type="hidden" name="enrollmentId" value={e.enrollmentId} />
                    <button
                      type="submit"
                      disabled={unenrollPending}
                      className="text-xs text-stamp hover:underline disabled:opacity-50 min-h-[40px] px-2"
                    >
                      Unenroll
                    </button>
                  </form>
                )}
                {e.status === "paused" && e.pausedReason !== "unsubscribed" && (
                  <form action={resumeAction}>
                    <input type="hidden" name="enrollmentId" value={e.enrollmentId} />
                    <button
                      type="submit"
                      className="text-xs text-register hover:underline min-h-[40px] px-2"
                    >
                      Resume
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
              className="text-xs font-semibold text-ink hover:underline min-h-[40px] px-2"
            >
              + Enroll in sequence
            </button>
          ) : (
            <form action={formAction} className="space-y-2">
              <input type="hidden" name="leadId" value={leadId} />
              <select
                name="sequenceId"
                className="w-full text-sm border border-rule bg-paper px-3 py-2 min-h-[44px] rounded font-mono"
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
                  className="text-xs px-3 py-1.5 min-h-[40px] border border-rule rounded hover:bg-paper-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="text-xs px-3 py-1.5 min-h-[40px] bg-ink text-paper rounded hover:opacity-90 disabled:opacity-50"
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
