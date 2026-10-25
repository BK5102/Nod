import { connection } from "@/lib/stdb/server";
import { body, fail, ok } from "@/lib/server/http";
import { runAgent } from "@/lib/agent/run";
import { pickTrip } from "@/lib/providers/shuffle";
import { DEMO_TRIP_ID } from "@/spacetimedb/src/core/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type In = { action: "reset" } | { action: "shuffle" } | { action: "card" } | { action: "cancel" } | { action: "price"; offerId: string; priceCents: number };

/** Demo controls (SIMULATED), run as the operator identity. The agent run uses the agent identity. */
export async function POST(req: Request) {
  try {
    const b = await body<In>(req);
    const op = await connection("operator");
    if (b.action === "reset") {
      await op.reducers.resetDemo({});
      return ok({ tripId: DEMO_TRIP_ID });
    }
    if (b.action === "shuffle") {
      // A random real flight and a random deadline, never the current flight. Its cancellation is still simulated.
      const current = op.db.trip.tripId.find(DEMO_TRIP_ID);
      const pick = await pickTrip(current?.flight ?? "");
      await op.reducers.setTrip({ route: pick.route, flight: pick.flight, departs: pick.departs, fareCents: pick.fareCents, deadline: pick.deadline });
      return ok({ tripId: DEMO_TRIP_ID, ...pick });
    }
    if (b.action === "card") {
      // A random card (SIMULATED): trip cap $300 to $1,500, ask above $100 to $500 and always below the cap.
      const step = (lo: number, hi: number, by: number) => lo + by * Math.floor(Math.random() * (Math.floor((hi - lo) / by) + 1));
      const tripCapCents = step(300, 1500, 50) * 100;
      const askAboveCents = step(100, Math.min(500, tripCapCents / 100 - 50), 25) * 100;
      await op.reducers.setCard({ tripCapCents, askAboveCents });
      return ok({ tripId: DEMO_TRIP_ID, tripCapCents, askAboveCents });
    }
    if (b.action === "cancel") {
      await op.reducers.cancelFlight({ tripId: DEMO_TRIP_ID });
      const run = await runAgent(DEMO_TRIP_ID);
      console.log(`[demo] cancel to options in ${run.ms} ms (claude ${run.claudeOk ? "ok" : `failed: ${run.claudeError}`})`);
      return ok({ tripId: DEMO_TRIP_ID, ...run });
    }
    if (b.action === "price") {
      const priceCents = Math.round(Number(b.priceCents));
      if (!b.offerId || !Number.isFinite(priceCents) || priceCents < 0) throw new Error("price needs offerId and priceCents");
      await op.reducers.setPrice({ offerId: b.offerId, priceCents });
      return ok({ offerId: b.offerId, priceCents });
    }
    throw new Error("Unknown action. Use reset, shuffle, card, cancel or price.");
  } catch (e) {
    return fail(e);
  }
}
