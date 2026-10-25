"use client";

import { useEffect, useRef, useState } from "react";
import { verifyReceipts } from "@/spacetimedb/src/core/receipt";
import { clockOf, money } from "./format";
import { Pictogram } from "./Pictogram";
import type { AgentStep, Mandate, Receipt, Trip } from "./types";

const kindWord: Record<AgentStep["kind"], string> = { info: "INFO", search: "SEARCH", decision: "DECIDED", refusal: "REFUSED", error: "ERROR" };
const kindColor: Record<AgentStep["kind"], string> = { info: "text-soft", search: "text-white", decision: "text-yellow", refusal: "text-alert", error: "text-alert" };

const SHOWN = 2;

/** The agent's steps as rows on a departures board. The newest few stay up; older ones fold away. */
export function Board({ steps, live }: { steps: AgentStep[]; live: boolean }) {
  const [all, setAll] = useState(false);
  const latest = steps.slice(-SHOWN);
  const pinned = steps.filter((s) => s.kind === "error" && !latest.includes(s));
  const rows = all ? steps : [...pinned, ...latest];
  const hidden = steps.length - rows.length;
  return (
    <section aria-labelledby="board" className="board">
      <div className="flex items-baseline justify-between gap-4 border-b border-rule px-4 py-3 md:px-6">
        <h2 id="board" className="text-lg font-extrabold">
          Latest
        </h2>
        <p className="text-sm text-soft">{live ? "Live" : "Mock data"}</p>
      </div>
      {steps.length === 0 ? (
        <p className="px-4 py-5 text-base text-soft md:px-6">Waiting for a cancellation.</p>
      ) : (
        <>
          {hidden > 0 ? (
            <button type="button" onClick={() => setAll(true)} className="w-full px-4 py-2 text-left text-sm font-semibold text-soft hover:text-white md:px-6">
              Full log ({steps.length})
            </button>
          ) : null}
          <ol className="divide-y divide-rule/60" aria-live="polite">
            {rows.map((s) => (
              <li key={s.id} className="row-in grid grid-cols-[auto_1fr] items-baseline gap-x-3 px-4 py-2.5 md:grid-cols-[6rem_6.5rem_1fr] md:px-6">
                <span className="font-mono text-sm font-medium text-soft">{clockOf(s.at)}</span>
                <span className={`font-mono text-sm font-semibold tracking-[0.06em] ${kindColor[s.kind]}`}>{kindWord[s.kind]}</span>
                <span className={`col-span-2 leading-snug md:col-span-1 ${s.kind === "refusal" || s.kind === "error" ? "font-bold text-alert" : "text-white"}`}>{s.text}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/** Counts up to a new value once, so the spend visibly lands on the meter. */
function useCountUp(target: number, ms = 700) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    if (a === target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(target);
      from.current = target;
      return;
    }
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      setV(Math.round((a + (target - a) * (1 - Math.pow(2, -10 * k))) / 100) * 100);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** The card's rules for this trip: one meter carries the cap and the ask line. */
export function MandateSign({ mandate, trip }: { mandate: Mandate; trip: Trip }) {
  const cap = mandate.tripCapCents;
  const shown = useCountUp(trip.spendCents);
  const pct = Math.min(100, (trip.spendCents / cap) * 100);
  const askPct = (mandate.askAboveCents / cap) * 100;
  return (
    <section id="mandate" aria-labelledby="mandate-h" className="scroll-mt-40 board px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="mandate-h" className="flex items-center gap-3 text-lg font-extrabold">
          <Pictogram name="card" size={32} className="bg-yellow! text-ink!" />
          Card rules
        </h2>
        <p className="text-sm text-soft">•••• 4242, simulated</p>
      </div>
      <p className="mt-3 text-[2rem] leading-none font-black">
        {money(shown)} <span className="text-lg font-bold text-soft">of {money(cap)}</span>
      </p>
      <div className="relative mt-3 h-4 bg-panel-2" role="meter" aria-valuemin={0} aria-valuemax={cap / 100} aria-valuenow={trip.spendCents / 100} aria-label="Spent against the trip cap">
        <div className="absolute inset-y-0 left-0 bg-yellow transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
        <div className="absolute -top-1 -bottom-1 w-0.5 bg-white" style={{ left: `${askPct}%` }} />
      </div>
      <div className="relative mt-1 h-5 text-sm font-semibold">
        <span className="absolute -translate-x-1/2" style={{ left: `${askPct}%` }}>
          asks above {money(mandate.askAboveCents)}
        </span>
        <span className="absolute right-0">cap</span>
      </div>
      <p className="mt-2 text-sm text-soft">Airlines and hotels only.</p>
    </section>
  );
}

/**
 * The receipt as a ticket stub: what was bought, for how much, who approved it. The chain is
 * recomputed in this browser; the raw hashes fold away behind one control.
 */
export function ReceiptSlip({ receipts, trip, voids = {} }: { receipts: Receipt[]; trip: Trip; voids?: Record<string, { priceCents: number; text: string }> }) {
  if (!receipts.length) return null;
  const chain = verifyReceipts(receipts);
  return (
    <section aria-labelledby="receipt" className="print bg-white text-ink">
      <div className="flex items-center justify-between border-b-4 border-ink px-4 py-2.5">
        <h2 id="receipt" className="text-lg font-extrabold">
          Receipt
        </h2>
        <p className="text-sm font-semibold">Simulated payment</p>
      </div>
      {receipts.map((r) => (
        <div key={r.seq} className="border-b-2 border-dashed border-ink/30 px-4 py-4">
          <div className="flex items-end justify-between gap-4">
            <p className="text-xl leading-tight font-extrabold">{r.merchant}</p>
            <p className="text-[2.4rem] leading-none font-black tracking-[-0.02em]">{money(r.amountCents)}</p>
          </div>
          <p className="mt-2 text-base font-semibold">
            Approved by you · •••• {r.tokenLast4} · <span className="font-mono text-sm">{clockOf(r.at)}</span>
          </p>
          {voids[r.offerId] ? <p className="mt-1 text-sm font-bold text-ink/70">{money(voids[r.offerId]!.priceCents)} {voids[r.offerId]!.text === "quote" ? "quote" : "approval"} voided: price changed</p> : null}
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold text-ink/70 hover:text-ink">How do I know this receipt is real?</summary>
            <p className="mt-2 max-w-[44ch] leading-snug">
              Each receipt carries a fingerprint of its contents and of the receipt before it. Change any detail and the fingerprints stop matching.
            </p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-ink/60">Price you approved</dt>
              <dd className="font-mono text-xs" title={r.quoteHash}>{r.quoteHash.slice(0, 12)}</dd>
              <dt className="text-ink/60">This receipt</dt>
              <dd className="font-mono text-xs" title={r.hash}>{r.hash.slice(0, 12)}</dd>
              <dt className="text-ink/60">Previous receipt</dt>
              <dd className="font-mono text-xs" title={r.prevHash}>{/^0+$/.test(r.prevHash) ? "None, this is the first" : r.prevHash.slice(0, 12)}</dd>
            </dl>
          </details>
        </div>
      ))}
      <p className={`bg-ink px-4 py-2 text-sm font-bold ${chain.ok ? "text-go" : "text-alert"}`}>{chain.ok ? "Fingerprints match: this receipt has not been changed" : `Fingerprints do not match: ${chain.reason}`}</p>
      {trip.refundOwedCents ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-lg font-extrabold">
          <Pictogram name="refund" size={36} />
          {money(trip.refundOwedCents)} refund owed
          <span className="text-sm font-semibold text-ink/70">within 7 business days</span>
        </p>
      ) : null}
    </section>
  );
}
