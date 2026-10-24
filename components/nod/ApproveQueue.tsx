"use client";

import { useState } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/src/module_bindings";
import type { RuleResult } from "@/spacetimedb/src/core/types";
import { daysBetween } from "@/spacetimedb/src/core/money";
import { day, money, parseJson, TIER_WORDS } from "@/lib/ui/format";
import { cn } from "@/lib/utils";
import { VoteCard } from "./VoteCard";

export function ApproveQueue() {
  const [waiting, ready] = useTable(tables.invoice.where((r) => r.status.eq("awaiting_approval")));
  const [decisions] = useTable(tables.policyDecision);
  const [vendors] = useTable(tables.vendor);
  const [actors] = useTable(tables.actor);
  const [clock] = useTable(tables.simClock);
  const asOf = clock[0]?.asOf ?? "";
  const rows = [...waiting].sort((a, b) => a.approvalRequestedAt.localeCompare(b.approvalRequestedAt));
  const [picked, setPicked] = useState<string | null>(null);
  const current = rows.find((r) => r.invoiceId === picked) ?? rows[0];

  if (!ready) return <p className="py-24 text-center text-ink-soft">Opening the queue...</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section aria-labelledby="queue-h" className="bg-white p-6 lg:col-span-7">
        <h1 id="queue-h" className="text-2xl font-bold">
          Waiting for Maya&apos;s yes
        </h1>
        <p className="mt-1 text-ink-soft">
          {rows.length === 0
            ? "Nothing waits for a person right now. Routine invoices inside the $2,500 limit go through."
            : `${rows.length} ${rows.length === 1 ? "bill" : "bills"}, oldest first. Nod paid everything else on its own.`}
        </p>
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="text-left text-ink-soft">
              <th className="pb-2 font-normal">Vendor and invoice</th>
              <th className="pb-2 font-normal">Why a person</th>
              <th className="pb-2 font-normal">Waiting</th>
              <th className="pb-2 text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = decisions.find((x) => x.invoiceId === r.invoiceId);
              const fired = parseJson<RuleResult[]>(d?.rulesJson ?? "", []).filter((x) => x.fired && x.id !== "autonomy");
              const v = vendors.find((x) => x.vendorId === r.vendorId);
              const waited = asOf && r.approvalRequestedAt ? Math.floor(daysBetween(r.approvalRequestedAt, asOf)) : 0;
              const who = actors.find((a) => a.actorId === r.assignedApprover);
              const active = current?.invoiceId === r.invoiceId;
              return (
                <tr key={r.invoiceId} className={cn("cursor-pointer border-t border-rule align-top", active && "bg-paper-raised")} onClick={() => setPicked(r.invoiceId)}>
                  <td className="py-3 pr-3">
                    <button type="button" className="text-left font-bold" onClick={() => setPicked(r.invoiceId)} aria-pressed={active}>
                      {v?.name ?? "Unknown vendor"}
                    </button>
                    <span className="block text-ink-soft">
                      {r.number}, due {r.dueDate ? day(r.dueDate) : "on receipt"}
                      {r.extractionMethod === "seed" && <span className="ml-2 text-xs font-bold">SEEDED</span>}
                    </span>
                  </td>
                  <td className="py-3 pr-3">
                    <span className={cn("px-1.5 py-0.5 text-xs font-bold", d?.finalTier === "HOLD" ? "bg-tabled" : "bg-paper-raised")}>{TIER_WORDS[d?.finalTier ?? "ASK"]}</span>
                    <span className="mt-1 block text-ink-soft">{fired.map((x) => x.label).join(", ") || "Over the auto-pay limit"}</span>
                  </td>
                  <td className="py-3 pr-3 tabular-nums">
                    {waited === 0 ? "Today" : `${waited} ${waited === 1 ? "day" : "days"}`}
                    {who && who.actorId !== "act_maya" && <span className="block text-ink-soft">Passed to {who.name.split(",")[0]}</span>}
                  </td>
                  <td className="py-3 text-right font-bold tabular-nums">{money(r.amountCents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <div className="lg:col-span-5">{current ? <VoteCard key={current.invoiceId} invoiceId={current.invoiceId} /> : null}</div>
    </div>
  );
}
