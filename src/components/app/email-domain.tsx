"use client";

import { useState, useTransition } from "react";
import {
  connectEmailDomain,
  checkEmailDomainStatus,
  setEmailFromAddress,
  removeEmailDomain,
} from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Label, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";

interface DnsRecord {
  host_name: string;
  type: string;
  value: string;
  status: boolean;
}

interface DomainRecords {
  brevo_code?: DnsRecord;
  dkim_record?: DnsRecord;
  dmarc_record?: DnsRecord;
}

const RECORD_LABELS: Record<string, string> = {
  brevo_code: "Brevo code (verification)",
  dkim_record: "DKIM (authentication)",
  dmarc_record: "DMARC (optional but recommended)",
};

export function EmailDomain({
  enabled,
  domain,
  status,
  records,
  fromAddress,
}: {
  enabled: boolean;
  domain: string | null;
  status: string | null;
  records: DomainRecords | null;
  fromAddress: string | null;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);
  const [domainInput, setDomainInput] = useState("");
  const [addrInput, setAddrInput] = useState(fromAddress ?? "");
  const [, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok?: boolean; message?: string }>) {
    setMsg(null);
    setOk(null);
    startTransition(async () => {
      const res = await fn();
      setOk(Boolean(res.ok));
      setMsg(res.message ?? (res.ok ? "Done" : "Something went wrong"));
    });
  }

  if (!enabled) {
    return (
      <p className="text-[11px] text-ink-soft mt-1">
        Want sequence emails to send from <em>your</em> domain (e.g. you@yourcompany.com)?
        Contact us to enable a custom sender domain.
      </p>
    );
  }

  const recordEntries = records
    ? (Object.entries(records) as [keyof DomainRecords, DnsRecord][]).filter(([, r]) => r)
    : [];

  return (
    <div className="mt-3 border border-rule rounded p-3 bg-panel space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">Custom sender domain</span>
        {status && (
          <Badge
            tone={
              status === "authenticated" ? "won" : status === "verified" ? "today" : "neutral"
            }
          >
            {status}
          </Badge>
        )}
      </div>

      {!domain ? (
        <>
          <p className="text-[11px] text-ink-soft">
            Send sequence emails from your own domain instead of xsta360.com.ng.
            You'll need to add 2–3 DNS records where your domain is hosted.
          </p>
          <div className="flex gap-2 items-end">
            <div className="flex-1 max-w-xs">
              <Label>Your domain</Label>
              <Input
                value={domainInput}
                onChange={(e) => setDomainInput(e.currentTarget.value)}
                placeholder="yourcompany.com"
              />
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => run(() => connectEmailDomain(domainInput))}
              disabled={!domainInput.trim()}
            >
              Connect
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs">
            <span className="font-mono font-medium">{domain}</span>
            {status !== "authenticated" && (
              <span className="text-ink-soft"> — add these DNS records at your domain host:</span>
            )}
          </p>

          {status !== "authenticated" && recordEntries.length > 0 && (
            <div className="overflow-x-auto border border-rule rounded">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-rule bg-paper-2">
                    <th className="text-left px-2 py-1.5 font-medium text-ink-soft">Record</th>
                    <th className="text-left px-2 py-1.5 font-medium text-ink-soft">Host</th>
                    <th className="text-left px-2 py-1.5 font-medium text-ink-soft">Type</th>
                    <th className="text-left px-2 py-1.5 font-medium text-ink-soft">Value</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {recordEntries.map(([key, r]) => (
                    <tr key={key}>
                      <td className="px-2 py-1.5 text-ink-soft whitespace-nowrap">
                        {RECORD_LABELS[key] ?? key}
                      </td>
                      <td className="px-2 py-1.5 font-mono">{r.host_name}</td>
                      <td className="px-2 py-1.5 font-mono">{r.type}</td>
                      <td className="px-2 py-1.5 font-mono break-all max-w-[280px]">{r.value}</td>
                      <td className="px-2 py-1.5 text-center">{r.status ? "✅" : "⏳"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap gap-2 items-end">
            {status === "authenticated" && (
              <div className="flex-1 min-w-[200px] max-w-xs">
                <Label>Sender address</Label>
                <div className="flex gap-2">
                  <Input
                    value={addrInput}
                    onChange={(e) => setAddrInput(e.currentTarget.value)}
                    placeholder={`sales@${domain}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => run(() => setEmailFromAddress(addrInput))}
                  >
                    Save
                  </Button>
                </div>
              </div>
            )}
            <div className="flex gap-2 ml-auto">
              {status !== "authenticated" && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => run(() => checkEmailDomainStatus())}
                >
                  Check status
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm(`Disconnect ${domain}? Sequence emails will send from xsta360.com.ng again.`)) {
                    run(() => removeEmailDomain());
                  }
                }}
              >
                Remove
              </Button>
            </div>
          </div>

          {status === "authenticated" && (
            <p className="text-[11px] text-won">
              ✓ Active — sequence emails send from {fromAddress ?? `noreply@${domain}`}
            </p>
          )}
        </>
      )}

      {msg && (
        <p className={`text-xs ${ok ? "text-won" : "text-stamp"}`}>{msg}</p>
      )}
    </div>
  );
}
