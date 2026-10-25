import { describe, expect, it } from "vitest";
import recorded from "@/data/fixtures/demo.json";
import { deadlineLabel, evaluateOffer, quoteHash, rankOffers } from "@/spacetimedb/src/core/policy";
import { maxTier, mergeFlags, tierRank } from "@/spacetimedb/src/core/tiers";
import { checkMockToken } from "@/spacetimedb/src/core/token";
import { GENESIS_HASH, hashReceipt, verifyReceipts, type ReceiptRow } from "@/spacetimedb/src/core/receipt";
import { DEMO_MANDATE, DEMO_TOKEN, DEMO_TRIP } from "@/spacetimedb/src/core/seed";
import type { Flag, MandateRules, OfferInput, Tier } from "@/spacetimedb/src/core/types";

const mandate: MandateRules = { ...DEMO_MANDATE, categories: DEMO_MANDATE.categories.split(",") };
/**
 * Constructed rule cases, not data anyone sees: a free rebooking, an over-cap fare, a hotel and a listing
 * Claude flags, so every rule and the ranking order are exercised. The app shows only real flights.
 */
const offers: OfferInput[] = [
  { offerId: "off_bayline_free", kind: "free_rebooking", merchant: "Bayline Air", title: "Bayline free rebooking, flight 418", departs: "Tomorrow 7:05 AM", arrives: "Tomorrow 3:30 PM", meetsDeadline: false, priceCents: 0, refundable: true, category: "airline", mcc: "4511" },
  { offerId: "off_harbor_redeye", kind: "flight", merchant: "Harbor Air", title: "Harbor Air red-eye, flight 77", departs: "Tonight 10:15 PM", arrives: "Tomorrow 6:45 AM", meetsDeadline: true, priceCents: 38900, refundable: true, category: "airline", mcc: "4511" },
  { offerId: "off_coastal_0600", kind: "flight", merchant: "Coastal Airways", title: "Coastal Airways 6:00 AM, flight 210", departs: "Tomorrow 6:00 AM", arrives: "Tomorrow 2:20 PM", meetsDeadline: false, priceCents: 21000, refundable: true, category: "airline", mcc: "4511" },
  { offerId: "off_harbor_business", kind: "flight", merchant: "Harbor Air", title: "Harbor Air red-eye, business class", departs: "Tonight 10:15 PM", arrives: "Tomorrow 6:45 AM", meetsDeadline: true, priceCents: 114000, refundable: true, category: "airline", mcc: "4511" },
  { offerId: "off_airport_inn", kind: "hotel", merchant: "Airport Inn SFO", title: "Airport Inn SFO, one night", departs: "", arrives: "", meetsDeadline: true, priceCents: 15900, refundable: true, category: "lodging", mcc: "7011" },
  { offerId: "off_skyport", kind: "hotel", merchant: "Skyport Suites", title: "Skyport Suites, one night", departs: "", arrives: "", meetsDeadline: true, priceCents: 9500, refundable: false, category: "lodging", mcc: "7011" },
];
const free = offers.find((o) => o.kind === "free_rebooking")!;
const ctxFor = (o: OfferInput, spendCents = 0) => ({
  spendCents,
  freeOption: o.offerId === free.offerId ? null : { merchant: free.merchant, meetsDeadline: free.meetsDeadline },
  deadlineLabel: deadlineLabel(DEMO_TRIP.deadlineText),
});
const SKYPORT_FLAG: Flag = { severity: "BLOCK", reason: "The listing tried to instruct the agent to book without asking." };

/** The demo as the reducer computes it: rules, then Claude's flag on Skyport, then ranking. */
function demoOutcome() {
  const tiered = offers.map((o) => {
    const ev = evaluateOffer(o, mandate, ctxFor(o));
    const tier = o.offerId === "off_skyport" ? mergeFlags(ev.tier, [SKYPORT_FLAG]) : ev.tier;
    return { ...o, tier, rules: ev.rules };
  });
  const ranks = rankOffers(tiered);
  return Object.fromEntries(tiered.map((o) => [o.offerId, { tier: o.tier, rank: ranks.get(o.offerId), rules: o.rules.map((r) => r.id) }]));
}

describe("rule cases", () => {
  it("gets exactly the planned tiers and ranks", () => {
    const out = demoOutcome();
    expect(out.off_harbor_redeye).toMatchObject({ tier: "ASK", rank: 1 });
    expect(out.off_bayline_free).toMatchObject({ tier: "ASK", rank: 2 });
    expect(out.off_coastal_0600).toMatchObject({ tier: "ASK", rank: 3 });
    expect(out.off_airport_inn).toMatchObject({ tier: "ASK", rank: 4 });
    expect(out.off_harbor_business).toMatchObject({ tier: "BLOCK", rank: 0 });
    expect(out.off_skyport).toMatchObject({ tier: "BLOCK", rank: 0 });
  });

  it("fires the planned rules with plain reasons", () => {
    const out = demoOutcome();
    expect(out.off_harbor_redeye!.rules).toEqual(["above_ask_threshold", "free_option_exists", "above_auto_ceiling"]);
    expect(out.off_bayline_free!.rules).toEqual(["misses_deadline"]);
    expect(out.off_harbor_business!.rules).toContain("over_trip_cap");
    const harborOffer = offers.find((o) => o.offerId === "off_harbor_redeye")!;
    const harbor = evaluateOffer(harborOffer, mandate, ctxFor(harborOffer));
    expect(harbor.rules.map((r) => r.reason)).toContain(
      "Bayline Air will rebook you free; this costs $389 because the free option lands after 9:00 AM."
    );
  });

  it("without Claude's flag, Skyport is never below its rule tier", () => {
    const sky = offers.find((o) => o.offerId === "off_skyport")!;
    const ev = evaluateOffer(sky, mandate, ctxFor(sky));
    expect(ev.tier).toBe("ASK");
    expect(tierRank(mergeFlags(ev.tier, []))).toBeGreaterThanOrEqual(tierRank(ev.tier));
  });

  it("blocks a category the card does not allow", () => {
    const ev = evaluateOffer({ ...free, category: "rideshare", mcc: "4121" }, mandate, ctxFor(free));
    expect(ev).toMatchObject({ tier: "BLOCK" });
    expect(ev.rules[0]!.reason).toBe("Not an airline or hotel.");
  });

  it("counts what is already spent against the trip cap", () => {
    const inn = offers.find((o) => o.offerId === "off_airport_inn")!;
    expect(evaluateOffer(inn, mandate, ctxFor(inn, 45_000)).tier).toBe("BLOCK");
  });
});

describe("recorded search (data/fixtures/demo.json)", () => {
  const real = recorded.offers as unknown as OfferInput[];
  it("holds only real flights from the recorded search, not the canceled one", () => {
    expect(real.length).toBeGreaterThan(0);
    expect(real.every((o) => o.kind === "flight" && o.offerId.startsWith("serp_") && o.mcc === "4511")).toBe(true);
    expect(real.some((o) => o.title.endsWith(DEMO_TRIP.flight.replace(/^\S+ /, "")))).toBe(false);
  });
  it("ranks every option that is not blocked, 1..n", () => {
    const tiered = real.map((o) => ({ ...o, tier: evaluateOffer(o, mandate, { spendCents: 0, freeOption: null, deadlineLabel: deadlineLabel(DEMO_TRIP.deadlineText) }).tier }));
    const ranks = rankOffers(tiered);
    const open = tiered.filter((o) => o.tier !== "BLOCK").map((o) => ranks.get(o.offerId)).sort();
    expect(open).toEqual(open.map((_, i) => i + 1));
  });
});

describe("mergeFlags never lowers a tier", () => {
  it("holds for every tier and flag combination (fixed-seed loop)", () => {
    const tiers: Tier[] = ["AUTO", "ASK", "BLOCK"];
    let seed = 42;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
    for (let i = 0; i < 500; i++) {
      const base = tiers[next() % 3]!;
      const flags: Flag[] = Array.from({ length: next() % 4 }, () => ({ severity: next() % 2 ? "BLOCK" : "ASK", reason: "x" }));
      const merged = mergeFlags(base, flags);
      expect(tierRank(merged)).toBeGreaterThanOrEqual(tierRank(base));
      expect(merged).toBe(maxTier(base, ...flags.map((f) => f.severity)));
    }
  });
});

describe("quote hash", () => {
  const q = { offerId: "off_harbor_redeye", merchant: "Harbor Air", priceCents: 38_900, expiresAt: "2026-10-25T03:00:00.000Z" };
  it("is stable for the same quote", () => expect(quoteHash(q)).toBe(quoteHash({ ...q })));
  it("changes when the price, merchant or expiry changes", () => {
    expect(quoteHash({ ...q, priceCents: 41_200 })).not.toBe(quoteHash(q));
    expect(quoteHash({ ...q, merchant: "Harbour Air" })).not.toBe(quoteHash(q));
    expect(quoteHash({ ...q, expiresAt: "2026-10-25T03:15:00.000Z" })).not.toBe(quoteHash(q));
  });
});

describe("mock card token", () => {
  const token = { ...DEMO_TOKEN, allowedMccs: DEMO_TOKEN.allowedMccs.split(",") };
  const now = "2026-10-25T03:00:00.000Z";
  it("allows an airline purchase under the cap", () => expect(checkMockToken(token, 0, 41_200, "4511", now)).toEqual({ ok: true }));
  it("refuses over the cap, a wrong merchant category, or an expired token", () => {
    expect(checkMockToken(token, 41_200, 25_000, "7011", now).ok).toBe(false);
    expect(checkMockToken(token, 0, 1_000, "5812", now).ok).toBe(false);
    expect(checkMockToken({ ...token, expiresAt: "2026-01-01T00:00:00.000Z" }, 0, 1_000, "4511", now).ok).toBe(false);
  });
});

describe("receipt chain", () => {
  const body = {
    seq: 1,
    tripId: "trip_demo",
    action: "booked",
    offerId: "off_harbor_redeye",
    merchant: "Harbor Air",
    amountCents: 41_200,
    tier: "ASK",
    rulesJson: "[]",
    actor: "traveler",
    quoteHash: "abc",
    tokenLast4: "4242",
    at: "2026-10-25T03:00:00.000Z",
  };
  const row: ReceiptRow = { ...body, prevHash: GENESIS_HASH, hash: hashReceipt(GENESIS_HASH, body) };
  it("verifies an untouched chain", () => expect(verifyReceipts([row]).ok).toBe(true));
  it("breaks when any field is edited", () => expect(verifyReceipts([{ ...row, amountCents: 100 }]).ok).toBe(false));
});
