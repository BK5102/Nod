"use client";

import Link from "next/link";
import { useState } from "react";
import { money } from "@/lib/ui/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Result {
  invoice: { id: string; number: string; amount_cents: number; vendor: string; asks_last4: string | null; on_file_last4: string | null; rawText: string };
  baseline: { amount_cents: number; to_last4: string; wrong_account: boolean };
  nod: { tier: string; reason: string; rules: { label: string; reason: string; tier: string }[]; ms: number };
  explanation: string | null;
  claudeError: string | null;
}

const TIER_FIELD: Record<string, string> = { AUTO: "bg-yes text-white", ASK: "bg-ink text-paper", HOLD: "bg-tabled text-ink" };
const TIER_VERDICT: Record<string, string> = { AUTO: "Nod paid it", ASK: "Nod asks a person first", HOLD: "Nod holds it" };

export function Moment() {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const res = await fetch("/api/moment/run", { method: "POST", signal: ctrl.signal });
      const b = (await res.json()) as { ok: boolean; result?: Result; error?: string };
      if (!b.ok || !b.result) throw new Error(b.error ?? "The run failed");
      setResult(b.result);
    } catch (e) {
      setError((e as Error).name === "AbortError" ? "No answer in 30 seconds. Nothing was paid. Run it again." : (e as Error).message);
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">The same invoice, two agents</h1>
          <p className="mt-1 max-w-[70ch]">
            A vendor emails a large invoice due tomorrow and asks to be paid into a new bank account. This is how most invoice scams work.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="lg" onClick={run} disabled={busy}>
            {busy ? "Running..." : result ? "Run it again" : "Run both"}
          </Button>
          <Button size="lg" variant="outline" onClick={() => { setResult(null); setError(null); }} disabled={busy || (!result && !error)}>
            Reset
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="bg-no p-4 font-bold text-white">
          {error}
        </p>
      )}

      {!result && !error && (
        <div className="bg-white p-8">
          <p className="text-lg">Press Run both. The baseline and Nod get the identical invoice from Harbor Produce Co., a SEEDED vendor whose account on file ends 4821.</p>
        </div>
      )}

      {result && (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <section aria-labelledby="baseline-h" className={cn("p-6", result.baseline.wrong_account ? "bg-no text-white" : "bg-paper-raised")}>
              <h2 id="baseline-h" className="text-lg font-bold">
                Baseline agent
              </h2>
              <p className="text-sm">A simple pay-everything agent we wrote, for comparison.</p>
              <p className="mt-6 text-3xl font-bold tabular-nums">
                Pays {money(result.baseline.amount_cents)} to ...{result.baseline.to_last4}
              </p>
              <p className="mt-2">It pays whatever account the invoice names. That account has never been on file for this vendor.</p>
            </section>

            <section aria-labelledby="nod-h" className={cn("p-6", TIER_FIELD[result.nod.tier])}>
              <h2 id="nod-h" className="text-lg font-bold">
                Nod
              </h2>
              <p className="text-sm">Decided by the rules inside the database in {(result.nod.ms / 1000).toFixed(1)} s.</p>
              <p className="mt-6 text-3xl font-bold">{TIER_VERDICT[result.nod.tier]}. No money moves.</p>
              <p className="mt-2 text-lg">{result.nod.reason}</p>
            </section>
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            <section aria-labelledby="explain-h" className="bg-white p-6 lg:col-span-7">
              <h2 id="explain-h" className="text-lg font-bold">
                Claude&apos;s explanation
              </h2>
              {result.explanation ? <p className="mt-2">{result.explanation}</p> : <p className="mt-2 text-ink-soft">{result.claudeError}</p>}
              <h3 className="mt-5 font-bold">Every rule that fired</h3>
              <ul className="mt-2 space-y-2">
                {result.nod.rules.map((r) => (
                  <li key={r.label}>
                    <span className="font-bold">{r.label}.</span> {r.reason}
                  </li>
                ))}
              </ul>
              <Link href={`/invoice?id=${result.invoice.id}`} className="mt-5 inline-block font-bold underline">
                Open the full record and the callback
              </Link>
            </section>
            <section aria-labelledby="email-h" className="bg-paper-raised p-6 lg:col-span-5">
              <h2 id="email-h" className="text-lg font-bold">
                The email both agents got
              </h2>
              <pre className="mt-3 whitespace-pre-wrap font-sans text-sm">{result.invoice.rawText}</pre>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
