import { connection } from "@/lib/stdb/server";
import { reason } from "@/lib/stdb/node";
import { body, fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The agent tries to approve a purchase for itself, with the correct quote hash. The database must
 * refuse it on the caller's identity. A refused call rolls back its own writes, so the refusal is
 * recorded afterwards as a step.
 */
export async function POST(req: Request) {
  try {
    const { offerId } = await body<{ offerId: string }>(req);
    const agent = await connection("agent");
    const offer = agent.db.offer.offerId.find(offerId);
    if (!offer) throw new Error(`No offer ${offerId}`);
    try {
      await agent.reducers.approveOffer({ offerId, quoteHash: offer.quoteHash });
    } catch (e) {
      const why = reason(e);
      await agent.reducers.logStep({ tripId: offer.tripId, kind: "refusal", text: `The agent tried to buy ${offer.title} itself. ${why}` });
      return ok({ refused: true, reason: why });
    }
    // Reaching here means the role check failed open. Say so loudly; never hide it.
    return fail(new Error("The agent was able to approve a purchase. This is a bug in the role check."), 500);
  } catch (e) {
    return fail(e);
  }
}
