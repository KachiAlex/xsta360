"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  createNote,
  updateNote,
  deleteNote,
  toggleNotePin,
  type TaskFormState,
} from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import { Label, Input, Textarea } from "@/components/ui/field";
import type { NoteRow } from "@/lib/tasks";

function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function NoteList({ notes, leadId }: { notes: NoteRow[]; leadId?: string }) {
  const [showForm, setShowForm] = useState(false);
  const [state, action, pending] = useActionState<TaskFormState, FormData>(createNote, {});

  // Close on success: reset showForm so the form can be reopened.
  const visible = showForm;
  useEffect(() => {
    if (state.ok) setShowForm(false);
  }, [state.ok]);
  const pinned = notes.filter((n) => n.pinned);
  const unpinned = notes.filter((n) => !n.pinned);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="font-mono text-base font-bold m-0">Notes</h2>
        <span className="text-xs text-ink-soft font-mono">{notes.length} total</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setShowForm(true)}
        >
          + Add note
        </Button>
      </div>

      {visible && (
        <form action={action} className="bg-paper-2 border border-rule rounded p-4 mb-4 space-y-3">
          {leadId && <input type="hidden" name="leadId" value={leadId} />}
          <div>
            <Label>Title</Label>
            <Input name="title" placeholder="e.g. Pricing notes for Q4 deals" autoFocus />
            {state.errors?.title && <p className="text-xs text-stamp mt-1">{state.errors.title[0]}</p>}
          </div>
          <div>
            <Label>Content</Label>
            <Textarea name="body" rows={4} placeholder="Write your note…" />
          </div>
          {state.message && (
            <p className="text-sm text-stamp bg-stamp/10 px-3 py-2 rounded">{state.message}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save note"}
            </Button>
          </div>
        </form>
      )}

      {pinned.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-ink-soft mb-2 font-semibold">
            Pinned
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pinned.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        </div>
      )}

      {unpinned.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {unpinned.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}

      {notes.length === 0 && !visible && (
        <div className="text-sm text-ink-soft py-8 text-center bg-paper-2 border border-dashed border-rule rounded">
          No notes yet. Click &quot;Add note&quot; to create one.
        </div>
      )}
    </div>
  );
}

function NoteCard({ note }: { note: NoteRow }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<TaskFormState, FormData>(updateNote, {});
  const [, startTransition] = useTransition();

  if (editing && !state.ok) {
    return (
      <form action={action} className="bg-panel border border-ink/30 rounded p-4 space-y-2">
        <input type="hidden" name="id" value={note.id} />
        <Input name="title" defaultValue={note.title} className="font-semibold" />
        <Textarea name="body" rows={4} defaultValue={note.body} />
        <input type="hidden" name="pinned" value={note.pinned ? "true" : "false"} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className={`bg-panel border border-rule rounded p-4 ${note.pinned ? "border-amber/40" : ""}`}>
      <div className="flex items-start gap-1 sm:gap-2 mb-1.5">
        <h3 className="font-semibold text-sm m-0 flex-1">{note.title}</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              await toggleNotePin({}, fd);
            });
          }}
        >
          <input type="hidden" name="id" value={note.id} />
          <button
            type="submit"
            className={`text-xs ${note.pinned ? "text-amber" : "text-ink-soft"} hover:text-ink min-w-[32px] min-h-[32px] flex items-center justify-center active:bg-paper-2 rounded`}
            title={note.pinned ? "Unpin" : "Pin"}
          >
            {note.pinned ? "📌" : "○"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-ink-soft hover:text-ink min-w-[32px] min-h-[32px] flex items-center justify-center active:bg-paper-2 rounded"
          title="Edit"
        >
          ✎
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              await deleteNote({}, fd);
            });
          }}
        >
          <input type="hidden" name="id" value={note.id} />
          <button type="submit" className="text-xs text-ink-soft hover:text-stamp min-w-[32px] min-h-[32px] flex items-center justify-center active:bg-stamp/10 rounded" title="Delete">
            ✕
          </button>
        </form>
      </div>
      {note.body && (
        <div className="text-sm text-ink-soft whitespace-pre-wrap mb-2">{note.body}</div>
      )}
      <div className="flex items-center gap-2 text-[11px] text-ink-soft font-mono">
        <span>{formatRelative(new Date(note.updatedAt))}</span>
        {note.leadName && (
          <Link
            href={`/leads/${note.leadId}`}
            className="text-ink-soft hover:text-ink underline underline-offset-2"
          >
            · {note.leadName}
          </Link>
        )}
      </div>
    </div>
  );
}
