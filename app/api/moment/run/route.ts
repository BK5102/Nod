import { claudeAvailable } from "@/lib/claude/client";
import { claudeReview } from "@/lib/claude/check";
import { checkInputFor } from "@/lib/stdb/map";
import { connection } from "@/lib/stdb/server";
import { waitFor } from "@/lib/stdb/node";
import { momentInvoice } from "@/lib/moment";
import { naivePay } from "@/lib/naive";
import { fail, ok } from "@/lib/server/http";
import type { RuleResult } from "@/spacetimedb/src/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Runs the same changed-bank-details invoice through the baseline we wrote and through Nod.
 * Nod's verdict is the database's rule tier, so it does not depend on Claude being reachable.
 * Claude's explanation is added when Claude answers; if it does not, the screen says so.
 */
export async function POST() {
  const t = Date.now();
  try {
    const { extracted, rawText } = momentInvoice();
    const agent = await connection("agent");
    const vendor = [...agent.db.vendor.iter()].find((v) => v.name === extracted.vendor_name);
    const baseline = naivePay(extracted, vendor?.bankLast4 ?? null);

    const invoiceId = `inv_moment_${Date.now().toString(36)}`;
    await agent.reducers.submitInvoice({
      invoiceId,
      extractedJson: JSON.stringify(extracted),
      rawText,
      sourceFormat: "email",
      filePath: "",
      extractionMethod: "structured",
      handoffJson: "",
    });
    const d = await waitFor(() => agent.db.policyDecision.invoiceId.find(invoiceId), "the policy decision", 15_000);
    const all = JSON.parse(d.rulesJson) as RuleResult[];
    const rules = all.filter((r) => r.fired);
    const why = rules.find((r) => r.id === "bank_change") ?? rules.find((r) => r.tier === d.ruleTier) ?? rules[0];
    const nodMs = Date.now() - t;

    let explanation: string | null = null;
    let claudeError: string | null = null;
    if (claudeAvailable()) {
      try {
        const review = await claudeReview(checkInputFor(agent, invoiceId)!);
        await agent.reducers.escalateInvoice({ invoiceId, claudeJson: JSON.stringify(review) });
        explanation = review.explanation;
      } catch (e) {
        claudeError = (e as Error).message;
      }
    } else {
      claudeError = "Claude is not configured on this server, so there is no written explanation. The hold comes from the rules.";
    }

    return ok({
      invoice: { id: invoiceId, number: extracted.invoice_number, amount_cents: extracted.amount_cents, vendor: extracted.vendor_name, asks_last4: extracted.remit_bank_last4, on_file_last4: vendor?.bankLast4 ?? null, rawText },
      baseline,
      nod: { tier: d.ruleTier, reason: why?.reason ?? "", rules: rules.map((r) => ({ label: r.label, reason: r.reason, tier: r.tier })), ms: nodMs },
      // Every checkpoint, passed or fired, for the money-route scene.
      checks: all.map((r) => ({ id: r.id, label: r.label, fired: r.fired, tier: r.tier, reason: r.reason })),
      explanation,
      claudeError,
    });
  } catch (e) {
    return fail(e, 502);
  }
}
