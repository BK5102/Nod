import { connection } from "@/lib/stdb/server";
import { body, fail, ok } from "@/lib/server/http";
import { runAgent } from "@/lib/agent/run";
import { searchRequestFor } from "@/lib/providers";
import { cancelableFlights } from "@/lib/providers/recorded";
import { DEMO_TRIP_ID } from "@/spacetimedb/src/core/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type In = { action: "reset" } | { action: "shuffle" } | { action: "cancel" } | { action: "price"; offerId: string; priceCents: number };

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
      // Another real flight from the recorded search, never the current one. Its cancellation is still simulated.
      const current = op.db.trip.tripId.find(DEMO_TRIP_ID);
      const pool = cancelableFlights((route) => searchRequestFor(route, "9:00 AM")).filter((f) => f.flight !== current?.flight);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (!pick) throw new Error("No other recorded flight to switch to.");
      await op.reducers.setTrip({ route: pick.route, flight: pick.flight, departs: pick.departs, fareCents: pick.fareCents });
      return ok({ tripId: DEMO_TRIP_ID, route: pick.route, flight: pick.flight, departs: pick.departs, fareCents: pick.fareCents, choices: pool.length + 1 });
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
    throw new Error("Unknown action. Use reset, shuffle, cancel or price.");
  } catch (e) {
    return fail(e);
  }
}
