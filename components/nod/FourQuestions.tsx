"use client";

import Link from "next/link";
import { useTable } from "spacetimedb/react";
import { tables } from "@/src/module_bindings";
import { money } from "@/lib/ui/format";
import { Button } from "@/components/ui/button";
import { RecoveryPanel } from "./RecoveryPanel";
import { WhyBox } from "./WhyBox";
import { AgentTryApprove } from "./AgentTryApprove";

/** Hyphenate's four judging questions, answered on screen, in order, from the live books. */
export function FourQuestions() {
  const [invoices] = useTable(tables.invoice);
  const [decisions] = useTable(tables.policyDecision);
  const [receipts] = useTable(tables.receipt);
  const [health] = useTable(tables.health);
  const [canary] = useTable(tables.canaryStats);

  const h = health[0];
  const c = canary[0];
  const decided = decisions.filter((d) => d.reviewed);
  const alone = receipts.filter((r) => r.decision === "paid" && r.signalConfidence < 0).length;
  const asked = decided.filter((d) => d.finalTier !== "AUTO").length;
  // The most recent payment a person said yes to, with how sure that yes was.
  const measured =
    [...receipts].filter((r) => r.decision === "paid" && r.signalConfidence >= 0).sort((a, b) => b.seq - a.seq)[0] ??
    [...receipts].filter((r) => r.signalConfidence >= 0).sort((a, b) => b.seq - a.seq)[0];
  const WORDS: Record<string, string> = { paid: "paid after a yes", held: "held", rejected: "refused", canary_caught: "attention check caught", canary_missed: "attention check missed" };
  const target = invoices.find((i) => i.status === "awaiting_approval") ?? invoices.find((i) => i.invoiceId === "inv_moment");

  return (
    <div className="space-y-6">
      <header className="bg-ink p-6 text-paper sm:p-10">
        <p className="max-w-[46ch] text-2xl leading-snug font-bold sm:text-3xl">
          An accounts payable clerk for a five-person nonprofit that never approves its own payments, knows when to ask, and can defend every decision.
        </p>
        <p className="mt-4 max-w-[70ch] text-paper/80">
          Nod at Eastbay Community Pantry, a fictional organization. Every payment carries a receipt of what Nod saw and how reliable the approval was.
        </p>
      </header>

      <ol className="space-y-6">
        <li className="grid gap-6 bg-white p-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="text-xl font-bold">1. Is it real enough?</h2>
            <p className="mt-2">Hand Nod any invoice, your own included: pasted text, an email, a photo or a PDF. Claude reads it; the rules in the database decide.</p>
            <Button asChild className="mt-4">
              <Link href="/intake">Hand Nod an invoice</Link>
            </Button>
          </div>
          <dl className="grid grid-cols-2 gap-4 lg:col-span-7">
            <div>
              <dt className="text-sm text-ink-soft">Receipts, hash-chained</dt>
              <dd className="text-3xl font-bold tabular-nums">{h ? h.chainLength : "-"}</dd>
              <dd className="text-sm">{h ? (h.chainOk ? "Chain verified in the database" : `Broken at ${h.chainBrokenAt}`) : ""}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-soft">Bank minus ledger</dt>
              <dd className="text-3xl font-bold tabular-nums">{h ? money(h.differenceCents) : "-"}</dd>
              <dd className="text-sm">{h ? (h.reconciled ? "Reconciled, double entry" : "Does not reconcile") : ""}</dd>
            </div>
            <p className="col-span-2 text-sm text-ink-soft">Vendors and history are SEEDED and labeled. The top bar&apos;s What is real button lists every simulated part.</p>
          </dl>
        </li>

        <li className="grid gap-6 bg-white p-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="text-xl font-bold">2. Would you hire it?</h2>
            <p className="mt-2">Limited access, a clean record, and knowing when to ask.</p>
          </div>
          <div className="space-y-5 lg:col-span-7">
            <div>
              <h3 className="font-bold">Never approves its own payments</h3>
              <p className="text-sm text-ink-soft">Nod asks the database to approve a bill with a perfect signal, using its own identity.</p>
              <div className="mt-2">
                <AgentTryApprove invoiceId={target?.invoiceId ?? null} />
              </div>
            </div>
            <div>
              <h3 className="font-bold">Knows when to ask</h3>
              <p>
                <span className="font-bold tabular-nums">{alone}</span> routine bills paid on their own. <span className="font-bold tabular-nums">{asked}</span> stopped for a person: changed bank details, duplicates, prices over contract, an invoice that tried to give orders.
              </p>
            </div>
            <div>
              <h3 className="font-bold">Can defend every decision</h3>
              <p>
                Ask it below, in question 4. <Link href="/books" className="underline">Read the books</Link>
              </p>
            </div>
          </div>
        </li>

        <li className="grid gap-6 bg-white p-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="text-xl font-bold">3. Did we see something new?</h2>
            <p className="mt-2">
              Detecting a changed bank account is not new. Measuring the yes is: every receipt stores how reliable the approval was, and a planted attention check tests the person.
            </p>
          </div>
          <div className="space-y-4 lg:col-span-7">
            {measured ? (
              <p>
                Receipt <span className="font-bold">{measured.seq}</span>: {measured.vendorName}, {money(measured.amountCents)}, {WORDS[measured.decision] ?? measured.decision}. The approval&apos;s signal confidence,{" "}
                <span className="font-bold tabular-nums">{measured.signalConfidence.toFixed(2)}</span>, is stored on the receipt and sealed into its hash.
              </p>
            ) : (
              <p className="text-ink-soft">No approvals on record yet.</p>
            )}
            <p>
              Planted bad bills caught: <span className="font-bold tabular-nums">{c ? `${c.caught} of ${c.caught + c.missed}` : "-"}</span>.
            </p>
            <p className="text-sm text-ink-soft">
              The approval segment uses a SIMULATED single-switch signal. A shaky yes on a risky bill is asked again, then defaults to no. <Link href="/approve" className="underline">Open it</Link>
            </p>
          </div>
        </li>

        <li className="bg-white p-6">
          <h2 className="text-xl font-bold">4. The moment</h2>
          <div className="mt-4 grid gap-8 lg:grid-cols-3">
            <section aria-labelledby="m-catch">
              <h3 id="m-catch" className="font-bold">
                Catches what others missed
              </h3>
              <p className="mt-1">A vendor asks to be paid into a new account. The baseline we wrote pays it. Nod holds it.</p>
              <Button asChild className="mt-3">
                <Link href="/moment">Watch the same invoice go through both</Link>
              </Button>
            </section>
            <section aria-labelledby="m-recover">
              <h3 id="m-recover" className="font-bold">
                Recovers from something going wrong
              </h3>
              <p className="mt-1 mb-3">The bank fails mid-payment (SIMULATED). Nod retries with the same idempotency key and pays exactly once.</p>
              <RecoveryPanel />
            </section>
            <section aria-labelledby="m-defend">
              <h3 id="m-defend" className="font-bold">
                Defends a decision when questioned
              </h3>
              <p className="mt-1 mb-3">Answered only from the receipts. If it is not there, it says so.</p>
              <WhyBox />
            </section>
          </div>
        </li>
      </ol>
    </div>
  );
}
