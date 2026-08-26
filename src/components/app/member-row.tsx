"use client";

import { useTransition } from "react";
import { changeRole, removeMember } from "@/app/actions/team";

export function MemberRow({
  membershipId,
  currentRole,
  isSelf,
}: {
  membershipId: string;
  currentRole: string;
  isSelf: boolean;
}) {
  const [, startTransition] = useTransition();

  return (
    <div className="inline-flex gap-2 items-center">
      <select
        name="role"
        defaultValue={currentRole}
        disabled={isSelf}
        className="text-sm border border-rule bg-panel rounded px-2 py-1"
        onChange={(e) => {
          const fd = new FormData();
          fd.set("membershipId", membershipId);
          fd.set("role", e.currentTarget.value);
          startTransition(async () => {
            await changeRole({}, fd);
          });
        }}
      >
        <option value="rep">Rep</option>
        <option value="manager">Manager</option>
        <option value="admin">Admin</option>
      </select>
      {!isSelf && (
        <button
          type="button"
          className="text-xs text-stamp hover:underline"
          onClick={() => {
            const fd = new FormData();
            fd.set("membershipId", membershipId);
            startTransition(async () => {
              await removeMember({}, fd);
            });
          }}
        >
          Remove
        </button>
      )}
    </div>
  );
}
