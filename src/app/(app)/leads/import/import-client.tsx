"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { importLeads, type ImportFormState } from "@/app/actions/import";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";

const FIELDS = ["name", "company", "email", "phone", "source", "campaign", "notes"] as const;
type Field = (typeof FIELDS)[number];

export function ImportClient({
  categories,
}: {
  categories: { id: string; name: string; icon: string }[];
}) {
  const [state, action, pending] = useActionState<ImportFormState, FormData>(importLeads, {});
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, Field | "">>({});
  const [fileName, setFileName] = useState("");

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length === 0) return;
      const hdrs = parseCsvLine(lines[0]);
      setHeaders(hdrs);
      // Auto-map by header name.
      const auto: Record<string, Field | ""> = {};
      for (const h of hdrs) {
        const lower = h.toLowerCase().trim();
        const match = FIELDS.find((f) => lower === f || lower.includes(f));
        auto[h] = match ?? "";
      }
      setMapping(auto);
      const parsedRows = lines.slice(1).map((line) => {
        const cells = parseCsvLine(line);
        const row: Record<string, string> = {};
        hdrs.forEach((h, i) => (row[h] = cells[i] ?? ""));
        return row;
      });
      setRows(parsedRows);
    };
    reader.readAsText(file);
  }

  function buildMappedRows(): Record<string, string>[] {
    return rows.map((row) => {
      const out: Record<string, string> = {};
      for (const [header, field] of Object.entries(mapping)) {
        if (field) out[field] = row[header] ?? "";
      }
      return out;
    });
  }

  return (
    <div className="content flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-7 max-w-[1240px] w-full mx-auto">
      <Link href="/leads" className="text-sm text-ink-soft hover:text-ink mb-4 inline-block">
        ← Back to leads
      </Link>
      <h1 className="font-mono text-xl mb-6">Import leads from CSV</h1>

      <div className="bg-panel border border-rule rounded-md p-6 mb-6">
        <label className="block">
          <span className="text-sm font-semibold mb-2 block">Choose a CSV file</span>
          <input
            type="file"
            accept=".csv"
            onChange={onFile}
            className="text-sm border border-rule bg-paper rounded px-3 py-2 w-full max-w-sm"
          />
        </label>
        {fileName && <p className="text-xs text-ink-soft mt-2">Loaded: {fileName} ({rows.length} rows)</p>}
      </div>

      {headers.length > 0 && (
        <div className="bg-panel border border-rule rounded-md p-6 mb-6">
          <h2 className="font-mono text-base mb-4">Map columns</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {headers.map((h) => (
              <div key={h} className="flex items-center gap-3">
                <span className="text-sm font-mono w-40 truncate">{h}</span>
                <Select
                  value={mapping[h] ?? ""}
                  onChange={(e) => {
                    const value = e.currentTarget.value as Field | "";
                    setMapping((m) => ({ ...m, [h]: value }));
                  }}
                  className="w-auto"
                >
                  <option value="">— Skip —</option>
                  {FIELDS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <form action={action}>
          <input type="hidden" name="rows" value={JSON.stringify(buildMappedRows())} />

          {/* Category selector */}
          {categories.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Assign all imported leads to a category</label>
              <Select name="categoryId" defaultValue="" className="max-w-sm">
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </Select>
              <p className="text-xs text-ink-soft mt-1">Category automations (sequence, assignee, follow-up) will apply to all imported leads.</p>
            </div>
          )}

          <Button type="submit" size="lg" disabled={pending || !mapping.name}>
            {pending ? "Importing…" : `Import ${rows.length} leads`}
          </Button>
          {!mapping.name && (
            <p className="text-xs text-stamp mt-2">Map a column to &quot;name&quot; to enable import.</p>
          )}
        </form>
      )}

      {state.ok && (
        <div className="mt-6 bg-register/10 border border-register/30 rounded-md p-4">
          <p className="text-sm text-register font-semibold">
            Imported {state.imported ?? 0} lead{state.imported === 1 ? "" : "s"}.
          </p>
          {state.errors && state.errors.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-ink-soft cursor-pointer">
                {state.errors.length} row(s) had errors
              </summary>
              <ul className="text-xs text-stamp mt-2 space-y-1">
                {state.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {state.message && !state.ok && (
        <p className="text-sm text-stamp mt-4">{state.message}</p>
      )}
    </div>
  );
}

function parseCsvLine(line: string): string[] {
  // Simple CSV parser (handles quoted fields).
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        cells.push(cur);
        cur = "";
      } else cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}
