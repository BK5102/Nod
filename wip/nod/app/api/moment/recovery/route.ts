import { makeBank } from "@/lib/bank";
import { heuristicCheck } from "@/lib/claude/check";
import { runPayQueue } from "@/lib/agent/run";
import { checkInputFor } from "@/lib/stdb/map";
import { connection } from "@/lib/stdb/server";
import { waitFor } from "@/lib/stdb/node";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Step {
  at_ms: number;
  what: string;
  ok: boolean;
}

/**
 * Recovers from something going wrong. A routine bill is cleared to pay, the (simulated) bank fails
 * on the first call, nothing posts to the ledger, the agent retries with the same idempotency key,
 * and the bill is paid exactly once. A deliberate third call with the same key proves the bank
 * would not pay twice. Uses MockBank; the outage is SIMULATED.
 */
export async function POST() {
  const t0 = Date.now();
  const steps: Step[] = [];
  const log = (what: string, ok = true) => steps.push({ at_ms: Date.now() - t0, what, ok });
  try {
    const agent = await connection("agent");
    const op = await connection("operator");
    const cases = 12 + Math.floor(Math.random() * 18);
    const extracted = {
      vendor_name: "CleanPath Janitorial",
      invoice_number: `CP-${6000 + Math.floor(Math.random() * 3000)}`,
      amount_cents: 21_000 + cases * 100,
      currency: "USD",
      invoice_date: "2026-06-23",
      due_date: "2026-07-23",
      po_number: "PO-2026-C1",
      remit_bank_last4: "6603",
      line_items: [{ description: "Additional deep clean service", quantity: 1, unit_price_cents: 21_000 + cases * 100, amount_cents: 21_000 + cases * 100 }],
      notes: null,
      sender_email: null,
    };
    const invoiceId = `inv_recovery_${Date.now().toString(36)}`;
    await agent.reducers.submitInvoice({
      invoiceId,
      extractedJson: JSON.stringify(extracted),
      rawText: `CleanPath Janitorial invoice ${extracted.invoice_number}, additional deep clean, total $${(extracted.amount_cents / 100).toFixed(2)}`,
      sourceFormat: "text",
      filePath: "",
      extractionMethod: "structured",
      handoffJson: "",
    });
    const input = await waitFor(() => checkInputFor(agent, invoiceId), "the policy decision");
    // Built-in checks only here: this moment is about the bank, and it must not depend on Claude.
    await agent.reducers.escalateInvoice({ invoiceId, claudeJson: JSON.stringify(heuristicCheck(input)) });
    const tier = agent.db.policyDecision.invoiceId.find(invoiceId)?.finalTier;
    if (tier !== "AUTO") throw new Error(`The routine bill was tiered ${tier}, so it was not cleared to pay. Reset the demo and try again.`);
    log(`Routine bill ${extracted.invoice_number} for $${(extracted.amount_cents / 100).toFixed(2)} cleared to pay. Payment intent written with idempotency key nod-${invoiceId}.`);

    await op.reducers.setBankOutage({ on: true });
    // The agent acts on its own view of the database; wait until it sees the outage.
    await waitFor(() => agent.db.simClock.id.find(1)?.bankOutage === true, "the outage to reach the agent", 5_000);
    log("SIMULATED: the bank goes down.", false);
    const first = await runPayQueue(agent);
    const firstMine = first.find((r) => r.invoiceId === invoiceId);
    if (firstMine?.ok) throw new Error("The simulated outage did not take effect; nothing to recover from. Run it again.");
    await waitFor(() => agent.db.invoice.invoiceId.find(invoiceId)?.status === "payment_pending", "the failed payment to be recorded", 5_000);
    log(`Attempt 1: ${firstMine?.detail ?? "no attempt"}. Nothing posted to the ledger; the bill waits as "bank failed, will retry".`, false);

    await op.reducers.setBankOutage({ on: false });
    await waitFor(() => agent.db.simClock.id.find(1)?.bankOutage === false, "the bank to come back for the agent", 5_000);
    log("The bank is back.");
    await waitFor(() => [...agent.db.payQueue.iter()].some((p) => p.invoiceId === invoiceId), "the retry to be queued", 5_000);
    const second = await runPayQueue(agent);
    const secondMine = second.find((r) => r.invoiceId === invoiceId);
    log(`Attempt 2, same idempotency key: ${secondMine?.ok ? "the bank confirmed" : (secondMine?.detail ?? "no attempt")}.`, !!secondMine?.ok);

    // Prove it: send the identical request again. The bank must hand back the same transfer, not a new one.
    const { bank } = makeBank(() => false);
    const again = await bank.pay({ idempotency_key: `nod-${invoiceId}`, amount_cents: extracted.amount_cents, to: { name: "CleanPath Janitorial", last4: "6603" }, memo: "duplicate check" });
    const inv = await waitFor(() => {
      const i = agent.db.invoice.invoiceId.find(invoiceId);
      return i?.status === "paid" ? i : null;
    }, "the paid status");
    const payments = [...agent.db.journal.iter()].filter((l) => l.invoiceId === invoiceId && l.memo.startsWith("Payment of") && l.creditCents > 0);
    const receipt = [...agent.db.receipt.iter()].filter((r) => r.invoiceId === invoiceId).pop();
    log(
      again.ok
        ? `Attempt 3, deliberately repeated: the bank returned the same transfer (${again.external_id}), not a second one.`
        : `Attempt 3, deliberately repeated: refused (${again.error}).`,
      again.ok,
    );
    const h = [...agent.db.health.iter()][0];
    return ok({
      invoiceId,
      status: inv.status,
      steps,
      cashPostings: payments.length,
      receipt: receipt ? { seq: receipt.seq, note: receipt.note } : null,
      reconciled: h?.reconciled ?? false,
    });
  } catch (e) {
    // Never leave the bank down after a failed demo.
    await connection("operator").then((op) => op.reducers.setBankOutage({ on: false })).catch(() => undefined);
    return fail(e, 502);
  }
}
