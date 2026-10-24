"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Out {
  invoiceId: string;
  status: string;
  steps: { at_ms: number; what: string; ok: boolean }[];
  cashPostings: number;
  receipt: { seq: number; note: string } | null;
  reconciled: boolean;
}

/** Recovers from something going wrong: the bank fails once (SIMULATED) and the bill is paid exactly once. */
export function RecoveryPanel() {
  const [out, setOut] = useState<Out | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setOut(null);
    try {
      const res = await fetch("/api/moment/recovery", { method: "POST" });
      const b = (await res.json()) as { ok: boolean; result?: Out; error?: string };
      if (!b.ok || !b.result) throw new Error(b.error ?? "The run failed");
      setOut(b.result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button onClick={run} disabled={busy}>
        {busy ? "Running..." : out ? "Run it again" : "Make the bank fail once"}
      </Button>
      {error && <p className="mt-3 text-no">{error}</p>}
      {out && (
        <div aria-live="polite" className="mt-4">
          <ol className="space-y-2 text-sm">
            {out.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className={cn("mt-0.5 inline-block h-3 w-3 shrink-0", s.ok ? "bg-yes" : "bg-no")} aria-hidden="true" />
                <span>
                  {s.what} <span className="text-ink-soft tabular-nums">({s.at_ms} ms)</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 bg-yes p-3 font-bold text-white">
            Paid exactly once: {out.cashPostings} cash {out.cashPostings === 1 ? "posting" : "postings"} in the ledger. Books {out.reconciled ? "reconcile" : "do not reconcile"}.
          </p>
          {out.receipt && (
            <p className="mt-2 text-sm">
              <span className="font-bold">Receipt {out.receipt.seq}:</span> {out.receipt.note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
