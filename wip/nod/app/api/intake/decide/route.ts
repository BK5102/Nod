import { claudeReview } from "@/lib/claude/check";
import { runPayQueue } from "@/lib/agent/run";
import { checkInputFor } from "@/lib/stdb/map";
import { connection } from "@/lib/stdb/server";
import { waitFor } from "@/lib/stdb/node";
import { body, fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Stage 3, "Deciding": Claude reviews the bill against the records and explains it in plain
 * English. Its flags (and the built-in checks) can only raise the tier. If the final tier is AUTO,
 * the database authorizes payment and the agent sends it to the bank. Retryable: if Claude fails,
 * the bill waits in "being checked" and nothing is paid.
 */
export async function POST(req: Request) {
  const t = Date.now();
  try {
    const { invoiceId } = await body<{ invoiceId: string }>(req);
    const agent = await connection("agent");
    const inv = agent.db.invoice.invoiceId.find(invoiceId);
    if (!inv) throw new Error("That invoice is not in the books.");
    if (inv.status === "reviewing") {
      const input = checkInputFor(agent, invoiceId);
      if (!input) throw new Error("The policy decision is missing.");
      const review = await claudeReview(input);
      await agent.reducers.escalateInvoice({ invoiceId, claudeJson: JSON.stringify(review) });
      await runPayQueue(agent);
    }
    const after = await waitFor(() => {
      const i = agent.db.invoice.invoiceId.find(invoiceId);
      return i && i.status !== "reviewing" && i.status !== "paying" ? i : null;
    }, "the final status", 10_000).catch(() => agent.db.invoice.invoiceId.find(invoiceId)!);
    const d = agent.db.policyDecision.invoiceId.find(invoiceId)!;
    const receipt = [...agent.db.receipt.iter()].filter((r) => r.invoiceId === invoiceId).pop();
    return ok({
      invoiceId,
      ruleTier: d.ruleTier,
      finalTier: d.finalTier,
      status: after.status,
      review: JSON.parse(d.claudeJson),
      receiptSeq: receipt?.seq ?? null,
      ms: Date.now() - t,
    });
  } catch (e) {
    return fail(e, 502);
  }
}
