import "server-only";
import { makeBank } from "@/lib/bank";
import { reason, type Conn } from "@/lib/stdb/node";

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
