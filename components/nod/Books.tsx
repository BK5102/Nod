"use client";

import Link from "next/link";
import { useState } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/src/module_bindings";
import { dayTime, money, STATUS_WORDS, longDate } from "@/lib/ui/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { seededLabel } from "@/lib/ui/seeded";
import { ReceiptEntry } from "./ReceiptEntry";

const DECISION: Record<string, { word: string; cls: string }> = {
  paid: { word: "Paid", cls: "bg-yes text-white" },
  held: { word: "Held", cls: "bg-tabled text-ink" },
  rejected: { word: "Refused", cls: "bg-no text-white" },
  canary_caught: { word: "Check passed", cls: "bg-yes text-white" },
  canary_missed: { word: "Check missed", cls: "bg-no text-white" },
};

const PERMISSIONS: { role: string; may: string; never: string }[] = [
  { role: "Nod (agent)", may: "Take in bills, request payment, pay bills inside its $2,500 auto-pay limit, settle with the bank", never: "Approve, change bank details, close the books, take a human seat" },
  { role: "Approver (Maya, Rosa)", may: "Give or withhold a yes", never: "Move money, change bank details" },
  { role: "Controller (Luis)", may: "Call vendors back, change bank details, close a month", never: "Approve a payment" },
  { role: "Auditor", may: "Read everything, ask why", never: "Change anything" },
];

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function Books() {
  const [invoices, ready] = useTable(tables.invoice);
  const [receipts] = useTable(tables.receipt);
  const [approvals] = useTable(tables.approval);
  const [audit] = useTable(tables.auditEvent);
  const [health] = useTable(tables.health);
  const [canary] = useTable(tables.canaryStats);
  const [balances] = useTable(tables.ledgerBalances);
  const [clock] = useTable(tables.simClock);
  const [actors] = useTable(tables.actor);

  const h = health[0];
  const c = canary[0];
  const asOf = clock[0]?.asOf ?? "";
  const waiting = invoices.filter((i) => ["awaiting_approval", "awaiting_controller", "payment_pending"].includes(i.status));
  const paid = invoices.filter((i) => i.status === "paid");
  const auto = receipts.filter((r) => r.decision === "paid" && r.signalConfidence < 0).length;
  const finals = approvals.filter((a) => a.decision !== "reconfirm");
  const refusals = finals.filter((a) => a.decision === "denied").length;
  const reconfirms = approvals.filter((a) => a.decision === "reconfirm").length;
  const latency = median(approvals.map((a) => a.latencyMs));
  const minutes = [...receipts].sort((a, b) => b.seq - a.seq);
  const trail = [...audit].sort((a, b) => Number(b.id - a.id)).slice(0, 8);
  const name = (id: string) => actors.find((a) => a.actorId === id)?.name.split(",")[0] ?? id;
  const [openSeq, setOpenSeq] = useState<number | null>(null);
  const opened = minutes.find((r) => r.seq === openSeq) ?? null;

  if (!ready) return <p className="py-24 text-center text-ink-soft">Opening the books...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Books</h1>
        <p className="mt-1 max-w-[80ch]">
          {waiting.length} {waiting.length === 1 ? "payment waits" : "payments wait"} for a person. Nod paid {auto} of {paid.length} bills on its own.{" "}
          {h ? (h.reconciled ? "Ledger and bank agree to the cent" : `Ledger and bank differ by ${money(Math.abs(h.differenceCents))}`) : ""}
          {h ? `, and all ${h.chainLength} receipts verify.` : "."}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="health-h" className="bg-white p-5">
          <h2 id="health-h" className="text-lg font-bold">
            Do the books hold?
          </h2>
          <dl className="mt-3 space-y-3">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-soft">Cash in the ledger</dt>
              <dd className="text-xl font-bold tabular-nums">{h ? money(h.ledgerCashCents) : "-"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-soft">Cash at the bank</dt>
              <dd className="text-xl font-bold tabular-nums">{h ? money(h.bankCashCents) : "-"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-rule pt-3">
              <dt className="text-ink-soft">Difference</dt>
              <dd className={cn("font-bold tabular-nums", h && h.differenceCents !== 0 ? "text-no" : "text-yes")}>{h ? money(h.differenceCents) : "-"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-soft">Every entry balances</dt>
              <dd className={cn("font-bold", h?.entriesBalanced ? "text-yes" : "text-no")}>{h ? (h.entriesBalanced ? "Yes" : "No") : "-"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-soft">Receipt chain</dt>
              <dd className={cn("font-bold", h?.chainOk ? "text-yes" : "text-no")}>
                {h ? (h.chainOk ? `${h.chainLength} verified` : `Broken at ${h.chainBrokenAt}`) : "-"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-ink-soft">Checked inside the database on every change.</p>
        </section>

        <section aria-labelledby="attention-h" className="bg-white p-5">
          <h2 id="attention-h" className="text-lg font-bold">
            Is the approver paying attention?
          </h2>
          <dl className="mt-3 space-y-3">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-soft">Planted bad bills caught</dt>
              <dd className="text-xl font-bold tabular-nums">{c ? `${c.caught} of ${c.caught + c.missed}` : "-"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-soft">Asked again on a weak signal</dt>
              <dd className="font-bold tabular-nums">{reconfirms}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-ink-soft">Planted bills never pay, even when approved. History is simulated.</p>
        </section>

        <section aria-labelledby="waiting-h" className="bg-white p-5">
          <h2 id="waiting-h" className="text-lg font-bold">
            Waiting on a person
          </h2>
          {waiting.length === 0 ? (
            <p className="mt-3 text-ink-soft">Nothing waits. Hand Nod a bill below to see it work.</p>
          ) : (
            <ul className="mt-3 divide-y divide-rule">
              {waiting.slice(0, 6).map((i) => (
                <li key={i.invoiceId} className="flex items-baseline justify-between gap-3 py-2">
                  <Link href={`/invoice?id=${i.invoiceId}`} className="min-w-0 truncate hover:underline">
                    {i.number}
                    <span className="block text-sm text-ink-soft">{STATUS_WORDS[i.status]}</span>
                  </Link>
                  <span className="font-bold tabular-nums">{money(i.amountCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <section aria-labelledby="minutes-h" className="bg-white p-5 lg:col-span-8">
          <h2 id="minutes-h" className="text-lg font-bold">
            Minute book
          </h2>
          <p className="mt-1 text-sm text-ink-soft">Every decision, numbered and hash-chained. Newest first. Select a row to open its receipt.</p>
          {opened && (
            <div className="mt-3 border border-rule">
              <ReceiptEntry receipt={opened} />
            </div>
          )}
          <div className="mt-3 max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-ink-soft">
                  <th className="py-2 pr-2 text-right font-normal">No.</th>
                  <th className="py-2 pr-2 font-normal">When</th>
                  <th className="py-2 pr-2 font-normal">Vendor</th>
                  <th className="py-2 pr-2 font-normal">Decision</th>
                  <th className="py-2 pr-2 text-right font-normal">Approval reliability</th>
                  <th className="py-2 text-right font-normal">Amount</th>
                </tr>
              </thead>
              <tbody>
                {minutes.map((r) => (
                  <tr
                    key={r.seq}
                    className={cn("cursor-pointer border-t border-rule hover:bg-paper-raised", openSeq === r.seq && "bg-paper-raised")}
                    onClick={() => setOpenSeq(openSeq === r.seq ? null : r.seq)}
                    aria-selected={openSeq === r.seq}
                  >
                    <td className="py-2 pr-2 text-right tabular-nums text-ink-soft">{r.seq}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">{dayTime(r.asOf)}</td>
                    <td className="py-2 pr-2">
                      <Link href={`/invoice?id=${r.invoiceId}`} className="hover:underline">
                        {r.vendorName}
                      </Link>
                      {(() => { const m = invoices.find((i) => i.invoiceId === r.invoiceId)?.extractionMethod ?? ""; const l = seededLabel(m); return l ? <span className="ml-2 text-xs font-bold text-ink-soft" title={l}>SEEDED</span> : null; })()}
                    </td>
                    <td className="py-2 pr-2">
                      <span className={cn("px-1.5 py-0.5 text-xs font-bold", DECISION[r.decision]?.cls)}>{DECISION[r.decision]?.word ?? r.decision}</span>
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{r.signalConfidence < 0 ? "-" : r.signalConfidence.toFixed(2)}</td>
                    <td className="py-2 text-right tabular-nums">{money(r.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-6 lg:col-span-4">
          <IngestForm />
          <SimControls outage={clock[0]?.bankOutage ?? false} asOf={asOf} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <section aria-labelledby="trail-h" className="bg-white p-5 lg:col-span-7">
          <h2 id="trail-h" className="text-lg font-bold">
            Audit trail
          </h2>
          <ul className="mt-3 divide-y divide-rule text-sm">
            {trail.map((e) => (
              <li key={String(e.id)} className="py-2">
                <span className={cn("font-bold", !e.allowed && "text-no")}>{e.allowed ? name(e.actorId) : `Refused: ${name(e.actorId)}`}</span>{" "}
                <span className="text-ink-soft">{dayTime(e.at)}</span>
                <span className="block">{e.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="ledger-h" className="bg-white p-5 lg:col-span-5">
          <h2 id="ledger-h" className="text-lg font-bold">
            Ledger by account
          </h2>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {balances.map((b) => (
                <tr key={b.account} className="border-t border-rule first:border-t-0">
                  <td className="py-2 pr-2">{b.account}</td>
                  <td className="py-2 text-right tabular-nums">{money(b.balanceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-sm text-ink-soft">Debits positive, credits negative. The column sums to zero.</p>
        </section>
      </div>

      <section aria-labelledby="perm-h" className="bg-white p-5">
        <h2 id="perm-h" className="text-lg font-bold">
          Who may do what
        </h2>
        <p className="mt-1 text-sm text-ink-soft">Enforced by the database on the caller&apos;s identity, not by this page.</p>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-ink-soft">
              <th className="py-2 pr-3 font-normal">Seat</th>
              <th className="py-2 pr-3 font-normal">May</th>
              <th className="py-2 font-normal">Never</th>
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p) => (
              <tr key={p.role} className="border-t border-rule align-top">
                <td className="py-2 pr-3 font-bold">{p.role}</td>
                <td className="py-2 pr-3">{p.may}</td>
                <td className="py-2">{p.never}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-sm text-ink-soft">Eastbay Community Pantry is fictional. Books as of {longDate(asOf)} on a simulated clock.</p>
    </div>
  );
}

function IngestForm() {
  return (
    <section aria-labelledby="ingest-h" className="bg-white p-5">
      <h2 id="ingest-h" className="text-lg font-bold">
        Hand Nod a bill
      </h2>
      <p className="mt-1 text-sm text-ink-soft">Paste text or attach a photo or PDF. Claude reads it, the books decide.</p>
      <Link href="/intake" className="mt-3 inline-block font-bold underline">
        Open the intake
      </Link>
    </section>
  );
}

function SimControls({ outage, asOf }: { outage: boolean; asOf: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  async function act(payload: object, done: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/operator", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const b = (await res.json()) as { ok: boolean; error?: string };
      setNote(b.ok ? done : (b.error ?? "Refused"));
      if (b.ok) await fetch("/api/agent/pay", { method: "POST" }).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="sim-h" className="bg-paper-raised p-5">
      <h2 id="sim-h" className="text-lg font-bold">
        Simulation controls
      </h2>
      <p className="mt-1 text-sm text-ink-soft">SIMULATED. Run as the demo operator. Shows that a bank failure never pays twice and never posts to the ledger.</p>
      <div className="mt-3 grid gap-2">
        <Button variant="outline" disabled={busy} onClick={() => act({ action: "outage", on: !outage }, outage ? "The bank is back." : "The bank is down. Payments will fail and wait.")}>
          {outage ? "End the bank outage" : "Take the bank down"}
        </Button>
      </div>
      {note && <p className="mt-2 text-sm">{note}</p>}
    </section>
  );
}
