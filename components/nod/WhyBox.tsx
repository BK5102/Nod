"use client";

import Link from "next/link";
import { useState } from "react";
import { dayTime, money } from "@/lib/ui/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Answer {
  inRecord: boolean;
  answer: string;
  method: "claude" | "template";
  claudeConfigured: boolean;
  cited: { seq: number; asOf: string; vendor: string; amountCents: number; decision: string; hash: string; invoiceNumber: string | null }[];
  ms: number;
}

const ASK = ["Why did you refuse HP-1180?", "Why did you pay Golden State Dairy in June?", "Why did you hold HP-1394?", "Why did you pay Acme Supplies $50,000?"];

/** "Why did you do this?" answered only from the receipts. */
export function WhyBox() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [a, setA] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(question: string) {
    setQ(question);
    setBusy(true);
    setError(null);
    setA(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25_000);
    try {
      const res = await fetch("/api/why", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }), signal: ctrl.signal });
      const b = (await res.json()) as { ok: boolean; result?: Answer; error?: string };
      if (!b.ok || !b.result) throw new Error(b.error ?? "No answer");
      setA(b.result);
    } catch (e) {
      setError((e as Error).name === "AbortError" ? "No answer in 25 seconds. Ask again." : (e as Error).message);
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) void ask(q.trim());
        }}
        className="flex flex-wrap gap-2"
      >
        <label htmlFor="why-q" className="sr-only">
          Your question
        </label>
        <input
          id="why-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Why did you pay, hold or refuse a bill?"
          className="min-w-0 flex-1 border border-rule bg-white px-3 py-2"
        />
        <Button type="submit" disabled={busy || !q.trim()}>
          {busy ? "Reading the receipts..." : "Ask"}
        </Button>
      </form>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {ASK.map((x) => (
          <button key={x} type="button" className="text-left underline" onClick={() => ask(x)} disabled={busy}>
            {x}
          </button>
        ))}
      </div>
      {error && <p className="mt-3 text-no">{error}</p>}
      {a && (
        <div aria-live="polite" className="mt-4">
          <p className={cn("p-4", a.inRecord ? "bg-white" : "bg-tabled font-bold")}>
            {a.method === "template" && a.inRecord && (
              <span className="mb-2 block text-sm font-normal text-ink-soft">
                {a.claudeConfigured ? "Claude did not answer, so" : "Claude is not configured, so"} these are the matching receipts, word for word:
              </span>
            )}
            <span className="whitespace-pre-line">{a.answer}</span>
          </p>
          {a.cited.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {a.cited.map((c) => (
                <li key={c.seq}>
                  <span className="font-bold">Receipt {c.seq}</span>, {dayTime(c.asOf)}, {c.vendor} {c.invoiceNumber ?? ""}, {money(c.amountCents)}, {c.decision}.{" "}
                  <span className="text-ink-soft">Hash {c.hash.slice(0, 12)}...</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-sm text-ink-soft">
            Answered from the receipt chain only, in {(a.ms / 1000).toFixed(1)} s. <Link href="/books" className="underline">See every receipt</Link>
          </p>
        </div>
      )}
    </div>
  );
}
