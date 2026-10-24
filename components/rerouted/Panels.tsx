"use client";

import { verifyReceipts } from "@/spacetimedb/src/core/receipt";
import { clockOf, money } from "./format";
import { Pictogram } from "./Pictogram";
import { parseRules, type AgentStep, type Mandate, type Receipt, type Trip } from "./types";

const kindWord: Record<AgentStep["kind"], string> = { info: "INFO", search: "SEARCH", decision: "DECIDED", refusal: "REFUSED", error: "ERROR" };
const kindColor: Record<AgentStep["kind"], string> = {
  info: "text-soft",
  search: "text-white",
  decision: "text-yellow",
  refusal: "text-alert",
  error: "text-alert",
};

/** The agent's steps as rows on a departures board. */
export function Board({ steps, live }: { steps: AgentStep[]; live: boolean }) {
  return (
    <section aria-labelledby="board" className="board">
      <div className="flex items-baseline justify-between gap-4 border-b border-rule px-4 py-3 md:px-6">
        <h2 id="board" className="text-xl font-extrabold">
          What the agent is doing
        </h2>
        <p className="text-sm text-soft">{live ? "Live, from the database" : "Mock data, backend not connected"}</p>
      </div>
      {steps.length === 0 ? (
        <p className="px-4 py-6 text-lg text-soft md:px-6">Nothing yet. When the flight is canceled, the agent starts here.</p>
      ) : (
        <ol className="divide-y divide-rule/60" aria-live="polite">
          {steps.map((s) => (
            <li key={s.id} className="row-in grid grid-cols-[auto_1fr] items-baseline gap-x-3 px-4 py-2.5 md:grid-cols-[6.5rem_7rem_1fr] md:px-6">
              <span className="font-mono text-sm font-medium text-soft">{clockOf(s.at)}</span>
              <span className={`font-mono text-sm font-semibold tracking-[0.06em] ${kindColor[s.kind]}`}>{kindWord[s.kind]}</span>
              <span className={`col-span-2 text-[1.05rem] leading-snug md:col-span-1 ${s.kind === "refusal" || s.kind === "error" ? "font-bold text-alert" : "text-white"}`}>{s.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** The card's rules for this trip, as a sign, with the spend measured against the cap. */
export function MandateSign({ mandate, trip }: { mandate: Mandate; trip: Trip }) {
  const cap = mandate.tripCapCents;
  const spent = trip.spendCents;
  const pct = Math.min(100, (spent / cap) * 100);
  const askPct = (mandate.askAboveCents / cap) * 100;
  return (
    <section aria-labelledby="mandate" className="board">
      <div className="flex items-center gap-3 px-4 pt-4">
        <Pictogram name="card" size={40} className="bg-yellow! text-ink!" />
        <div>
          <h2 id="mandate" className="text-xl leading-tight font-extrabold">
            Your card&apos;s rules for this trip
          </h2>
          <p className="text-sm text-soft">Card ending 4242. Simulated token, no money moves.</p>
        </div>
      </div>

      <div className="px-4 pt-4">
        <div className="flex items-baseline justify-between">
          <p className="text-[2rem] leading-none font-black">
            {money(spent)} <span className="text-lg font-bold text-soft">of {money(cap)}</span>
          </p>
          <p className="text-sm text-soft">{spent ? "spent on this trip" : "nothing spent yet"}</p>
        </div>
        <div className="relative mt-3 h-4 bg-panel-2" role="meter" aria-valuemin={0} aria-valuemax={cap / 100} aria-valuenow={spent / 100} aria-label="Spent against the trip cap">
          <div className="absolute inset-y-0 left-0 bg-yellow transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
          <div className="absolute -top-1 -bottom-1 w-0.5 bg-white" style={{ left: `${askPct}%` }} />
        </div>
        <div className="relative mt-1 h-5 text-xs text-soft">
          <span className="absolute -translate-x-1/2" style={{ left: `${askPct}%` }}>
            ask above {money(mandate.askAboveCents)}
          </span>
          <span className="absolute right-0">cap {money(cap)}</span>
        </div>
      </div>

      <ul className="mt-2 grid grid-cols-1 divide-y divide-rule border-t border-rule sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <li className="px-4 py-3">
          <p className="text-2xl font-black">{money(cap)}</p>
          <p className="text-sm text-soft">most this trip can cost</p>
        </li>
        <li className="px-4 py-3">
          <p className="text-2xl font-black">{money(mandate.askAboveCents)}</p>
          <p className="text-sm text-soft">above this, it asks you</p>
        </li>
        <li className="px-4 py-3">
          <p className="text-lg leading-tight font-black">Airlines, hotels</p>
          <p className="text-sm text-soft">nothing else</p>
        </li>
      </ul>
    </section>
  );
}

const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;

/** The receipt slip, hash-chained: every field a stranger needs to audit the purchase. */
export function ReceiptSlip({ receipts, trip }: { receipts: Receipt[]; trip: Trip }) {
  if (!receipts.length) return null;
  // Recomputed in this browser from the public rows: any edit to any receipt breaks the chain.
  const chain = verifyReceipts(receipts);
  return (
    <section aria-labelledby="receipt" className="row-in bg-white text-ink">
      <div className="flex items-center justify-between gap-3 border-b-4 border-ink px-4 py-3">
        <h2 id="receipt" className="text-xl font-extrabold">
          Receipt
        </h2>
        <p className="text-sm font-semibold">Simulated payment</p>
      </div>
      {receipts.map((r) => {
        const rules = parseRules(r.rulesJson);
        return (
          <dl key={r.seq} className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1.5 border-b border-dashed border-ink/40 px-4 py-4 text-base">
            <dt className="text-ink/70">Bought</dt>
            <dd className="font-bold">{r.merchant}</dd>
            <dt className="text-ink/70">Amount</dt>
            <dd className="text-2xl leading-none font-black">{money(r.amountCents)}</dd>
            <dt className="text-ink/70">Approved by</dt>
            <dd className="font-bold">You, the traveler. The agent cannot approve.</dd>
            <dt className="text-ink/70">Card rules</dt>
            <dd>{rules.map((x) => x.reason).join(" ")}</dd>
            <dt className="text-ink/70">Card</dt>
            <dd className="font-mono">•••• {r.tokenLast4}</dd>
            <dt className="text-ink/70">At</dt>
            <dd className="font-mono">{clockOf(r.at)}</dd>
            <dt className="text-ink/70">Quote</dt>
            <dd className="font-mono text-sm break-all">{r.quoteHash}</dd>
            <dt className="text-ink/70">Chain</dt>
            <dd className="font-mono text-sm">
              #{r.seq} · prev {short(r.prevHash)} · this {short(r.hash)}
            </dd>
          </dl>
        );
      })}
      <p className={`px-4 py-2 text-sm font-bold ${chain.ok ? "bg-ink text-go" : "bg-ink text-alert"}`}>
        {chain.ok ? `Chain verified in this browser: ${receipts.length} receipt${receipts.length === 1 ? "" : "s"}, every hash recomputed.` : `Chain broken: ${chain.reason}`}
      </p>
      {trip.refundOwedCents ? (
        <p className="flex items-start gap-3 px-4 py-4 text-lg leading-snug font-bold">
          <Pictogram name="refund" size={40} />
          <span>
            Your {money(trip.refundOwedCents)} refund for the canceled ticket is owed within 7 business days.
            <span className="block text-sm font-semibold text-ink/70">Under the US rule on automatic refunds for canceled flights.</span>
          </span>
        </p>
      ) : null}
    </section>
  );
}
