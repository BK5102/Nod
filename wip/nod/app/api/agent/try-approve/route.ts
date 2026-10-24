import { connection } from "@/lib/stdb/server";
import { body, fail, ok } from "@/lib/server/http";
import { reason } from "@/lib/stdb/node";
import { samplesFor } from "@/spacetimedb/src/core/classifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Demonstrates segregation of duties: the agent identity tries to approve its own payment request
 * with a perfect signal. The database refuses it, and the refusal goes on the record.
 */
export async function POST(req: Request) {
  try {
    const { invoiceId } = await body<{ invoiceId: string }>(req);
    const agent = await connection("agent");
    try {
      await agent.reducers.approve({ invoiceId, samples: samplesFor(0.99), latencyMs: 0 });
      return ok({ refused: false, message: "The database accepted it. This should never happen." });
    } catch (e) {
      const msg = reason(e);
      await agent.reducers.logDenied({ action: "approve its own payment request", target: invoiceId, detail: `The database refused: ${msg}` });
      return ok({ refused: true, message: msg });
    }
  } catch (e) {
    return fail(e);
  }
}
