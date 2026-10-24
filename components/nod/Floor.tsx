"use client";

import { useTable } from "spacetimedb/react";
import { tables } from "@/src/module_bindings";
import type { ClaudeCheck, ExtractedInvoice, RuleResult, SourceRow } from "@/spacetimedb/src/core/types";
import { day, dayTime, money, parseJson, STATUS_WORDS, TIER_WORDS } from "@/lib/ui/format";
import { naivePay } from "@/lib/naive";
import { cn } from "@/lib/utils";
import { VoteCard } from "./VoteCard";
import { ControllerCard } from "./ControllerCard";
import { ReceiptEntry } from "./ReceiptEntry";
import { AgentTryApprove } from "./AgentTryApprove";

const SOURCE_WORDS: Record<string, string> = {
  invoice: "the invoice",
  purchase_order: "the purchase order",
  contract: "the contract",
  vendor_master: "the vendor record",
  bank_history: "bank history",
  ledger: "the ledger",
};

const TIER_FIELD: Record<string, string> = { AUTO: "bg-yes text-white", ASK: "bg-ink text-paper", HOLD: "bg-tabled text-ink" };

export function Floor({ invoiceId }: { invoiceId: string }) {
  const [invoices, ready] = useTable(tables.invoice.where((r) => r.invoiceId.eq(invoiceId)));
  const [decisions] = useTable(tables.policyDecision.where((r) => r.invoiceId.eq(invoiceId)));
  const [vendors] = useTable(tables.vendor);
  const [receipts] = useTable(tables.receipt.where((r) => r.invoiceId.eq(invoiceId)));
  const [approvals] = useTable(tables.approval.where((r) => r.invoiceId.eq(invoiceId)));

  const inv = invoices[0];
  const d = decisions[0];
  if (!ready) return <p className="py-24 text-center text-ink-soft">Opening the books...</p>;
  if (!inv || !d) {
    return (
      <p className="py-24 text-center text-ink-soft">
        Invoice {invoiceId} is not in the books. Reset the demo with <code>pnpm seed</code>.
      </p>
    );
  }

  const x = parseJson<ExtractedInvoice>(inv.extractedJson, {} as ExtractedInvoice);
  const vendor = vendors.find((v) => v.vendorId === inv.vendorId);
  const rules = parseJson<RuleResult[]>(d.rulesJson, []).filter((r) => r.fired);
  const review = parseJson<ClaudeCheck | null>(d.claudeJson, null);
  const sources = parseJson<SourceRow[]>(d.sourcesJson, []);
  const naive = naivePay(x, vendor?.bankLast4 ?? null);
  const receipt = [...receipts].sort((a, b) => b.seq - a.seq)[0];
  const hold = d.finalTier === "HOLD";

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* The motion on the floor */}
      <article className="bg-white lg:col-span-8" aria-labelledby="motion-h">
        <div className="p-6 sm:p-8">
          <h1 id="motion-h" className="text-2xl font-bold">
            {vendor?.name ?? x.vendor_name} wants {money(inv.amountCents)}
          </h1>
          {inv.extractionMethod === "seed" && <p className="mt-1 text-sm font-bold text-ink-soft">SEEDED invoice from a fictional vendor</p>}
          <p className="mt-1 text-ink-soft">
            Invoice {inv.number}, received {dayTime(inv.receivedAt)}
            {x.sender_email ? ` from ${x.sender_email}` : ""}, due {inv.dueDate ? day(inv.dueDate) : "on receipt"}.
          </p>

          <dl className="mt-6 grid border border-rule sm:grid-cols-3">
            <div className="border-b border-rule p-4 sm:border-r sm:border-b-0">
              <dt className="text-sm text-ink-soft">Amount</dt>
              <dd className="mt-1 text-4xl font-bold tabular-nums">{money(inv.amountCents)}</dd>
            </div>
            <div className="border-b border-rule p-4 sm:border-r sm:border-b-0">
              <dt className="text-sm text-ink-soft">Pay into, says the invoice</dt>
              <dd className={cn("mt-1 text-4xl font-bold tabular-nums", naive.wrong_account && "text-no")}>...{x.remit_bank_last4 ?? "-"}</dd>
            </div>
            <div className="p-4">
              <dt className="text-sm text-ink-soft">Account on file</dt>
              <dd className="mt-1 text-4xl font-bold tabular-nums">...{vendor?.bankLast4 ?? "-"}</dd>
            </div>
          </dl>
        </div>

        <section aria-labelledby="verdict-h" className={cn("px-6 py-5 sm:px-8", TIER_FIELD[d.finalTier])}>
          <h2 id="verdict-h" className="text-xl font-bold">
            Nod: {TIER_WORDS[d.finalTier]}. {STATUS_WORDS[inv.status] ?? inv.status}.
          </h2>
          <p className="mt-1 text-sm">
            The rules set {d.ruleTier}; the second review {d.finalTier !== d.ruleTier ? `raised it to ${d.finalTier}` : "agreed"}. A review can raise a tier, never lower it.
          </p>
        </section>

        <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-2">
          <section aria-labelledby="why-h">
            <h2 id="why-h" className="text-lg font-bold">
              Why
            </h2>
            <ul className="mt-3 space-y-3">
              {rules.map((r) => (
                <li key={r.id}>
                  <span className="font-bold">{r.label}.</span> {r.reason}
                </li>
              ))}
              {review?.flags.map((f) => (
                <li key={f.code}>
                  <span className="font-bold">Second review.</span> {f.reason}
                </li>
              ))}
              {rules.length === 0 && !review?.flags.length && <li>Every rule passed.</li>}
            </ul>
            {review && (
              <p className="mt-4 text-sm text-ink-soft">
                Reviewed by {review.method === "claude" ? "Claude" : "the built-in checks (no Claude key set)"}. Trusted source: {SOURCE_WORDS[review.trusted_source === "vendor_record" ? "vendor_master" : review.trusted_source] ?? review.trusted_source}. {review.trust_reason}
              </p>
            )}
          </section>

          <section aria-labelledby="sources-h">
            <h2 id="sources-h" className="text-lg font-bold">
              Which source wins
            </h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-ink-soft">
                  <th className="pb-2 font-normal">Field</th>
                  <th className="pb-2 font-normal">Trusted</th>
                  <th className="pb-2 font-normal">Agree</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.field} className="border-t border-rule align-top">
                    <td className="py-2 pr-2 font-bold">{s.field}</td>
                    <td className="py-2 pr-2">
                      {s.trusted_value}
                      <span className="block text-ink-soft">from {SOURCE_WORDS[s.system_of_record]}</span>
                    </td>
                    <td className={cn("py-2 font-bold", s.agree ? "text-yes" : "text-no")}>{s.agree ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </article>

      {/* The side of the floor: the baseline, the vote, the callback, the minutes */}
      <aside className="space-y-6 lg:col-span-4" aria-label="What happens to this payment">
        <section aria-labelledby="naive-h" className={cn("p-5", naive.wrong_account ? "bg-no text-white" : "bg-paper-raised")}>
          <h2 id="naive-h" className="text-lg font-bold">
            A pay-everything agent
          </h2>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            Paid {money(naive.amount_cents)} to ...{naive.to_last4}
          </p>
          <p className="mt-1 text-sm">
            {naive.wrong_account
              ? `The moment the email arrived. That account has never been on file for ${(vendor?.name ?? "this vendor").replace(/\.$/, "")}.`
              : "The moment it arrived, without asking anyone."}
          </p>
        </section>

        {(inv.status === "awaiting_approval" || approvals.length > 0) && <VoteCard invoiceId={invoiceId} compact={false} />}

        {inv.status === "awaiting_controller" && (
          <ControllerCard invoiceId={invoiceId} vendorName={vendor?.name ?? "the vendor"} askedLast4={x.remit_bank_last4 ?? "-"} onFileLast4={vendor?.bankLast4 ?? "-"} />
        )}

        {receipt && <ReceiptEntry receipt={receipt} />}

        <section aria-labelledby="sod-h" className="bg-paper-raised p-5">
          <h2 id="sod-h" className="text-lg font-bold">
            Can Nod approve its own request?
          </h2>
          <p className="mt-1 text-sm text-ink-soft">Nod asks the database to approve this with a perfect signal, using its own identity.</p>
          <div className="mt-3">
            <AgentTryApprove invoiceId={invoiceId} />
          </div>
        </section>
      </aside>
    </div>
  );
}
