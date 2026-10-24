import { askWhy } from "@/lib/claude/auditor";
import { claudeAvailable } from "@/lib/claude/client";
import { connection } from "@/lib/stdb/server";
import { body, fail, ok } from "@/lib/server/http";
import type { Receipt, RuleResult, Tier } from "@/spacetimedb/src/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * "Why did you do this?" Answered only from the hash-chained receipts in the database. Claude may
 * only cite receipts it was given; anything else is "Not in the record". Without Claude, the
 * matching receipts are shown word for word and labeled as such.
 */
export async function POST(req: Request) {
  const t = Date.now();
  try {
    const { question, invoiceId } = await body<{ question: string; invoiceId?: string }>(req);
    const q = String(question ?? "").trim().slice(0, 500);
    if (!q) throw new Error("Ask a question about a payment.");
    const agent = await connection("agent");
    const numbers: Record<string, string> = {};
    for (const i of agent.db.invoice.iter()) numbers[i.invoiceId] = i.number;
    const receipts: Receipt[] = [...agent.db.receipt.iter()]
      .sort((a, b) => a.seq - b.seq)
      .map((r) => ({
        id: String(r.seq),
        seq: r.seq,
        invoice_id: r.invoiceId,
        vendor_name: r.vendorName,
        amount_cents: r.amountCents,
        decision: r.decision as Receipt["decision"],
        tier: r.tier as Tier,
        rules: JSON.parse(r.rulesJson) as Pick<RuleResult, "id" | "reason" | "tier">[],
        claude_explanation: r.explanation,
        signal_confidence: r.signalConfidence < 0 ? null : r.signalConfidence,
        actor_ids: JSON.parse(r.actorIdsJson) as string[],
        as_of: r.asOf,
        note: r.note,
        prev_hash: r.prevHash,
        hash: r.hash,
      }));
    const a = await askWhy(q, receipts, invoiceId, numbers);
    return ok({
      inRecord: a.in_record,
      answer: a.answer,
      method: a.method,
      claudeConfigured: claudeAvailable(),
      cited: a.cited.map((r) => ({ seq: r.seq, asOf: r.as_of, vendor: r.vendor_name, amountCents: r.amount_cents, decision: r.decision, hash: r.hash, invoiceNumber: numbers[r.invoice_id] ?? null })),
      ms: Date.now() - t,
    });
  } catch (e) {
    return fail(e, 502);
  }
}
