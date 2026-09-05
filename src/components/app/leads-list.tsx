"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { BulkActionBar, LeadCheckbox } from "@/components/app/bulk-category-bar";
import type { BulkCategoryOption, BulkSequenceOption } from "@/components/app/bulk-category-bar";

export interface LeadRow {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  campaign: string | null;
  stageName: string | null;
  stageKind: string;
  value: string | null;
  score: number;
  assigneeName: string | null;
  updatedAt: string;
  categories: { id: string; name: string; icon: string; color: string }[];
}

const SOURCE_LABELS: Record<string, string> = {
  referral: "Referral",
  social: "Social",
  ad: "Ad campaign",
  walk_in: "Walk-in",
  embedded_form: "Website form",
  other: "Other",
};

export function LeadsList({
  leads,
  categories,
  members,
  stages,
  sequences,
  canDelete,
}: {
  leads: LeadRow[];
  categories: BulkCategoryOption[];
  members: { userId: string; name: string }[];
  stages: { id: string; name: string }[];
  sequences: BulkSequenceOption[];
  canDelete: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (prev.size === leads.length) return new Set();
      return new Set(leads.map((l) => l.id));
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const leadIds = leads.map((l) => l.id);
  const allSelected = selected.size === leads.length && leads.length > 0;
  const hasCategories = categories.length > 0;

  return (
    <div>
      {/* Bulk action bar — shared selection state */}
      <BulkActionBar
        leadIds={leadIds}
        categories={categories}
        members={members}
        stages={stages}
        sequences={sequences}
        selected={selected}
        onClear={clearSelection}
        canDelete={canDelete}
      />

      {/* Select all toggle (always visible when there are leads) */}
      {leads.length > 0 && (
        <div className="mb-2 flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft cursor-pointer min-h-[36px]">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="w-4 h-4 accent-ink cursor-pointer"
            />
            {allSelected ? "Deselect all" : `Select all (${leads.length})`}
          </label>
          {selected.size > 0 && (
            <span className="text-xs text-ink-soft">
              {selected.size} selected
            </span>
          )}
        </div>
      )}

      {/* Desktop: table */}
      <table className="w-full border-collapse hidden md:table">
        <thead>
          <tr>
            <th className="px-3 py-3 border-b border-rule w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="w-4 h-4 accent-ink cursor-pointer"
                aria-label="Select all leads"
              />
            </th>
            <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Lead</th>
            <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Stage</th>
            <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Source</th>
            {hasCategories && (
              <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Categories</th>
            )}
            <th className="text-right font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Value</th>
            <th className="text-right font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Score</th>
            <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Assignee</th>
            <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Updated</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} className="hover:bg-paper-2">
              <td className="px-3 py-3.5 border-b border-dashed border-rule">
                <LeadCheckbox
                  leadId={lead.id}
                  selected={selected.has(lead.id)}
                  onToggle={toggle}
                />
              </td>
              <td className="px-5 py-3.5 border-b border-dashed border-rule">
                <Link href={`/leads/${lead.id}`} className="font-semibold hover:underline">
                  {lead.name}
                </Link>
                {lead.company && (
                  <div className="text-xs text-ink-soft">{lead.company}</div>
                )}
              </td>
              <td className="px-5 py-3.5 border-b border-dashed border-rule">
                {lead.stageKind === "won" ? (
                  <Badge tone="won">{lead.stageName ?? "Won"}</Badge>
                ) : lead.stageKind === "lost" ? (
                  <Badge tone="lost">{lead.stageName ?? "Lost"}</Badge>
                ) : (
                  <Badge tone="neutral">{lead.stageName ?? "—"}</Badge>
                )}
              </td>
              <td className="px-5 py-3.5 border-b border-dashed border-rule text-sm">
                {SOURCE_LABELS[lead.source] ?? lead.source}
                {lead.campaign && <div className="text-xs text-ink-soft">{lead.campaign}</div>}
              </td>
              {hasCategories && (
                <td className="px-5 py-3.5 border-b border-dashed border-rule">
                  <div className="flex flex-wrap gap-1">
                    {lead.categories.map((cat) => (
                      <span
                        key={cat.id}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: `${cat.color}18`, color: cat.color }}
                      >
                        {cat.icon} {cat.name}
                      </span>
                    ))}
                    {lead.categories.length === 0 && <span className="text-xs text-ink-soft">—</span>}
                  </div>
                </td>
              )}
              <td className="px-5 py-3.5 border-b border-dashed border-rule text-sm font-mono text-right">
                {lead.value ? `₦${parseFloat(lead.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
              </td>
              <td className="px-5 py-3.5 border-b border-dashed border-rule text-right">
                {lead.score > 0 ? (
                  <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${
                    lead.score >= 70 ? "bg-register/12 text-register"
                    : lead.score >= 40 ? "bg-amber/14 text-[#9c6014]"
                    : "bg-paper-2 text-ink-soft"
                  }`}>
                    {lead.score}
                  </span>
                ) : "—"}
              </td>
              <td className="px-5 py-3.5 border-b border-dashed border-rule text-sm">
                {lead.assigneeName ?? <span className="text-ink-soft">Unassigned</span>}
              </td>
              <td className="px-5 py-3.5 border-b border-dashed border-rule text-sm text-ink-soft">
                {new Date(lead.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile: card list */}
      <div className="md:hidden divide-y divide-dashed divide-rule">
        {leads.map((lead) => (
          <div key={lead.id} className="flex items-start gap-2 px-4 py-3 active:bg-paper-2/50 transition-colors">
            <div className="pt-1">
              <LeadCheckbox
                leadId={lead.id}
                selected={selected.has(lead.id)}
                onToggle={toggle}
              />
            </div>
            <Link href={`/leads/${lead.id}`} className="block flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{lead.name}</div>
                  {lead.company && <div className="text-xs text-ink-soft truncate">{lead.company}</div>}
                </div>
                {lead.stageKind === "won" ? (
                  <Badge tone="won">{lead.stageName ?? "Won"}</Badge>
                ) : lead.stageKind === "lost" ? (
                  <Badge tone="lost">{lead.stageName ?? "Lost"}</Badge>
                ) : (
                  <Badge tone="neutral">{lead.stageName ?? "—"}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-soft flex-wrap mb-1">
                <span>{SOURCE_LABELS[lead.source] ?? lead.source}</span>
                {lead.value && <span className="font-mono">₦{parseFloat(lead.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>}
                {lead.score > 0 && (
                  <span className={`font-mono font-bold px-1.5 py-0.5 rounded ${
                    lead.score >= 70 ? "bg-register/12 text-register"
                    : lead.score >= 40 ? "bg-amber/14 text-[#9c6014]"
                    : "bg-paper-2 text-ink-soft"
                  }`}>
                    {lead.score}
                  </span>
                )}
                <span className="ml-auto">{new Date(lead.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              </div>
              {lead.categories.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {lead.categories.map((cat) => (
                    <span
                      key={cat.id}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: `${cat.color}18`, color: cat.color }}
                    >
                      {cat.icon} {cat.name}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
