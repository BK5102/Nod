import "server-only";
import { makeBank } from "@/lib/bank";
import { claudeCheck } from "@/lib/claude/check";
import { checkInputFor } from "@/lib/stdb/map";
import { reason, waitFor, type Conn } from "@/lib/stdb/node";
import type { ExtractedInvoice, SourceFormat } from "@/spacetimedb/src/core/types";

export interface PayRun {
  invoiceId: string;
  ok: boolean;
  detail: string;
}

/**
 * Executes every authorized payment intent against the bank, then settles or fails it in the
 * database. The idempotency key is the database's, so a retry after a timeout cannot pay twice.
 */
export async function runPayQueue(agent: Conn): Promise<PayRun[]> {
  const { bank, fallback_reason } = makeBank(() => agent.db.simClock.id.find(1)?.bankOutage ?? false);
  const out: PayRun[] = [];
  for (const p of [...agent.db.payQueue.iter()]) {
    const r = await bank.pay({
      idempotency_key: p.idempotencyKey,
      amount_cents: p.amountCents,
      to: { name: p.vendorName, last4: p.toLast4 },
      memo: `Eastbay Community Pantry ${p.invoiceId}`,
    });
    try {
      if (r.ok) {
        await agent.reducers.settlePayment({ invoiceId: p.invoiceId, externalId: r.external_id, adapter: r.adapter });
        out.push({ invoiceId: p.invoiceId, ok: true, detail: `Paid via ${r.adapter}${fallback_reason ? ` (${fallback_reason})` : ""}` });
      } else {
        await agent.reducers.paymentFailed({ invoiceId: p.invoiceId, adapter: r.adapter, error: r.error });
        out.push({ invoiceId: p.invoiceId, ok: false, detail: r.error });
      }
    } catch (e) {
      out.push({ invoiceId: p.invoiceId, ok: false, detail: reason(e) });
    }
  }
  return out;
}

export interface IngestResult {
  invoiceId: string;
  tier: string;
  status: string;
  review: "claude" | "heuristic";
  payments: PayRun[];
}

/**
 * The agent's full intake for one invoice: submit (the database sets the tier), second review (can
 * only raise it), then pay anything the database authorized.
 */
export async function ingestOne(
  agent: Conn,
  args: { extracted: ExtractedInvoice; rawText: string; sourceFormat: SourceFormat; extractionMethod: string },
): Promise<IngestResult> {
  const invoiceId = `inv_live_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await agent.reducers.submitInvoice({
    invoiceId,
    extractedJson: JSON.stringify(args.extracted),
    rawText: args.rawText,
    sourceFormat: args.sourceFormat,
    filePath: "",
    extractionMethod: args.extractionMethod,
    handoffJson: "",
  });
  const input = await waitFor(() => checkInputFor(agent, invoiceId), "the policy decision");
  const review = await claudeCheck(input);
  await agent.reducers.escalateInvoice({ invoiceId, claudeJson: JSON.stringify(review) });
  const payments = await runPayQueue(agent);
  const inv = await waitFor(() => agent.db.invoice.invoiceId.find(invoiceId), "the invoice row");
  const d = agent.db.policyDecision.invoiceId.find(invoiceId);
  return { invoiceId, tier: d?.finalTier ?? "?", status: inv.status, review: review.method, payments };
}
