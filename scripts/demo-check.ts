// pnpm demo:check. Replays the locked demo (docs/PLAN.md section 12) against the live database and the
// running app, with no UI, and asserts the state after every beat. Also the role, quote, cap, receipt
// chain and privacy checks. Needs `pnpm dev` running (DEMO_URL, default http://localhost:3001) and
// .env.local from `pnpm db:setup`.
import { connectAs, reason, subscribeAll, waitFor, type Conn } from "@/lib/stdb/node";
import { verifyReceipts } from "@/spacetimedb/src/core/receipt";
import { DEMO_PROFILE, DEMO_TRIP, DEMO_TRIP_ID } from "@/spacetimedb/src/core/seed";
import { env, refused } from "./env";

const URL = process.env.DEMO_URL ?? "http://localhost:3001";
const t0 = Date.now();
let failures = 0;

function check(ok: boolean, what: string, detail = "") {
  const ms = String(Date.now() - t0).padStart(6);
  console.log(`${ms} ms  ${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

async function post(path: string, payload: unknown): Promise<{ ok: boolean; result?: Record<string, unknown>; error?: string }> {
  const res = await fetch(`${URL}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  return (await res.json()) as { ok: boolean; result?: Record<string, unknown>; error?: string };
}

const offers = (c: Conn) => [...c.db.offer.iter()].filter((o) => o.tripId === DEMO_TRIP_ID);
const offer = (c: Conn, id: string) => c.db.offer.offerId.find(id);
const steps = (c: Conn) => [...c.db.agentStep.iter()].filter((s) => s.tripId === DEMO_TRIP_ID);

async function main() {
  const host = env("SPACETIMEDB_HOST");
  const db = env("SPACETIMEDB_DB_NAME");
  const operator = (await connectAs(host, db, env("SPACETIMEDB_OPERATOR_TOKEN"))).conn;
  const traveler = (await connectAs(host, db)).conn; // a fresh browser-like identity
  await Promise.all([subscribeAll(operator), subscribeAll(traveler)]);
  await traveler.reducers.takeSeat({ actorId: "act_traveler" });

  // 1. reset
  const r = await post("/api/demo", { action: "reset" });
  await waitFor(() => traveler.db.trip.tripId.find(DEMO_TRIP_ID)?.status === "scheduled" && offers(traveler).length === 0, "reset");
  check(r.ok, "reset: trip scheduled, no offers", r.error);

  // 2. cancel, agent run
  const c = await post("/api/demo", { action: "cancel" });
  const source = String(c.result?.source ?? "");
  const live = source.startsWith("live");
  check(
    c.ok,
    "cancel: route returned",
    c.error ?? `${c.result?.ms} ms, ${source}${c.result?.fallbackReason ? ` (fell back: ${c.result.fallbackReason})` : ""}, claude ${c.result?.claudeOk ? "ok" : `failed: ${c.result?.claudeError}`}`
  );
  if (live && c.result?.fallbackReason) {
    console.log(`\nLive flight search failed (${c.result.fallbackReason}). Nothing to check; no offers were shown.`);
    process.exit(1);
  }
  await waitFor(() => traveler.db.trip.tripId.find(DEMO_TRIP_ID)?.status === "options_ready" && offers(traveler).length > 0, "options");

  // Real flights only (live or recorded): the same guarantees, whatever the search returned.
  const flights = offers(traveler).filter((o) => /^(duf|serp)_/.test(o.offerId));
  check(flights.length > 0 && flights.length === offers(traveler).length, "cancel: only real flights, nothing simulated", `${flights.length} of ${offers(traveler).length} offers`);
  const ranks = offers(traveler).filter((o) => o.rank > 0).map((o) => o.rank).sort((a, b) => a - b);
  check(ranks.every((r, i) => r === i + 1), "cancel: ranks are 1..n with no gaps", ranks.join(","));
  check(offers(traveler).every((o) => o.tier !== "BLOCK" || o.rank === 0), "cancel: every BLOCK offer is set aside");

  check(steps(traveler).length >= 5, "cancel: agent steps streamed", `${steps(traveler).length} steps`);

  // The flight the traveler buys: the top-ranked paid flight that fits under the cap after a price rise.
  const target = offers(traveler)
    .filter((o) => o.kind === "flight" && o.status === "open" && o.priceCents + 2_300 <= 60_000)
    .sort((a, b) => a.rank - b.rank)[0];
  if (!target) throw new Error("No paid flight under the cap to run the purchase checks on");
  const newPrice = target.priceCents + 2_300;
  const newDollars = `$${(newPrice / 100).toFixed(newPrice % 100 ? 2 : 0)}`;

  // 3. the agent tries to buy for itself
  const ta = await post("/api/agent/try-approve", { offerId: target.offerId });
  check(ta.ok && ta.result?.refused === true, "agent cannot approve its own purchase", String(ta.result?.reason ?? ta.error));
  await waitFor(() => steps(traveler).some((s) => s.kind === "refusal" && s.text.includes("agent tried")), "refusal step");
  check(true, "refusal step written");

  // 4. the operator cannot approve either
  const opRefusal = await refused(operator.reducers.approveOffer({ offerId: target.offerId, quoteHash: target.quoteHash }));
  check(!!opRefusal, "operator cannot approve", opRefusal ?? "was NOT refused");

  // 5. price change voids the old quote
  const oldHash = target.quoteHash;
  const p = await post("/api/demo", { action: "price", offerId: target.offerId, priceCents: newPrice });
  await waitFor(() => offer(traveler, target.offerId)?.priceCents === newPrice, "price change");
  const stale = await refused(traveler.reducers.approveOffer({ offerId: target.offerId, quoteHash: oldHash }));
  check(p.ok && !!stale && stale.includes(`price changed to ${newDollars}`), "approval of the old quote is refused", stale ?? "was NOT refused");

  // 6. approve the new quote
  const fresh = offer(traveler, target.offerId)!;
  try {
    await traveler.reducers.approveOffer({ offerId: fresh.offerId, quoteHash: fresh.quoteHash });
  } catch (e) {
    check(false, `approve ${newDollars}`, reason(e));
  }
  await waitFor(() => traveler.db.trip.tripId.find(DEMO_TRIP_ID)?.status === "booked", "booking");
  const trip = traveler.db.trip.tripId.find(DEMO_TRIP_ID)!;
  const receipts = [...traveler.db.receipt.iter()].filter((x) => x.tripId === DEMO_TRIP_ID);
  check(trip.spendCents === newPrice && receipts.length === 1, `booked at ${newDollars}, one receipt`, `spend ${trip.spendCents}, ${receipts.length} receipts`);

  // 7. a second flight is refused (by the cap or the one-flight rule, whichever the fares trip first)
  const other = offers(traveler).find((o) => o.kind === "flight" && o.status === "open" && o.tier !== "BLOCK");
  if (other) {
    const second = await refused(traveler.reducers.approveOffer({ offerId: other.offerId, quoteHash: other.quoteHash }));
    check(!!second && /already have a flight|over your/.test(second), "a second flight is refused", second ?? "was NOT refused");
  }

  // 8. blocked options stay blocked (whichever search result is blocked, if any)
  const biz = offers(traveler).find((o) => o.tier === "BLOCK");
  if (biz) {
    const blocked = await refused(traveler.reducers.approveOffer({ offerId: biz.offerId, quoteHash: biz.quoteHash }));
    check(!!blocked && /blocked/.test(blocked), `${biz.title} (blocked) is refused`, blocked ?? "was NOT refused");
  } else {
    console.log("        no blocked option in this search, so the blocked check was skipped");
  }

  // 9. receipt chain
  const chain = verifyReceipts(receipts);
  check(chain.ok, "receipt chain recomputes to the stored hash", chain.reason ?? "");

  // 10. commerce numbers
  check(trip.refundOwedCents === trip.fareCents && !!trip.canceledAt && !!trip.bookedAt, `refund owed $${trip.fareCents / 100}, canceled and booked times set`, `${trip.canceledAt} to ${trip.bookedAt}`);
  if (trip.canceledAt && trip.bookedAt) {
    const secs = Math.round((Date.parse(trip.bookedAt) - Date.parse(trip.canceledAt)) / 1000);
    console.log(`        cancel to booked: ${secs} s (this run, including the scripted pauses)`);
  }

  // 11. privacy: no personal data in any public row
  const publicText = JSON.stringify(
    [traveler.db.trip, traveler.db.mandate, traveler.db.offer, traveler.db.agentStep, traveler.db.receipt, traveler.db.actor].flatMap((tb) => [...tb.iter()]),
    (_k, v) => (typeof v === "bigint" ? v.toString() : v)
  );
  const leaks = [DEMO_PROFILE.name, "Rivera", DEMO_PROFILE.email, DEMO_PROFILE.bookingRef, DEMO_PROFILE.loyaltyNumber, "tok_mock_demo"].filter((s) => publicText.includes(s));
  check(leaks.length === 0, "no personal data or token reference in public rows", leaks.join(", "));

  // 12. shuffle: another real flight from the recorded search, a clean slate, and the operator only
  const sh = await post("/api/demo", { action: "shuffle" });
  const picked = sh.result as { route?: string; flight?: string; fareCents?: number } | undefined;
  await waitFor(() => {
    const tr = traveler.db.trip.tripId.find(DEMO_TRIP_ID);
    return tr?.status === "scheduled" && tr.flight === picked?.flight && offers(traveler).length === 0 ? tr : null;
  }, "shuffle");
  const shuffled = traveler.db.trip.tripId.find(DEMO_TRIP_ID)!;
  check(sh.ok && shuffled.flight !== DEMO_TRIP.flight && shuffled.fareCents === picked?.fareCents && shuffled.spendCents === 0, "shuffle: another real flight, scheduled, nothing booked", `${shuffled.flight}, ${shuffled.route}, ${shuffled.departs}, $${shuffled.fareCents / 100}, ${shuffled.deadlineText}`);
  const travelerShuffle = await refused(traveler.reducers.setTrip({ route: "SFO to JFK", flight: "Test 1", departs: "4:15 PM", fareCents: 100, deadline: "9:00 AM" }));
  check(!!travelerShuffle, "traveler cannot change the demo flight", travelerShuffle ?? "was NOT refused");
  await post("/api/demo", { action: "reset" });

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(reason(e));
  process.exit(1);
});
