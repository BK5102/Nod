import { describe, expect, it } from "vitest";
import fixture from "@/data/fixtures/demo.json";
import { deadlineLabel, evaluateOffer, quoteHash, rankOffers } from "@/spacetimedb/src/core/policy";
import { maxTier, mergeFlags, tierRank } from "@/spacetimedb/src/core/tiers";
import { checkMockToken } from "@/spacetimedb/src/core/token";
import { GENESIS_HASH, hashReceipt, verifyReceipts, type ReceiptRow } from "@/spacetimedb/src/core/receipt";
import { DEMO_MANDATE, DEMO_TOKEN, DEMO_TRIP } from "@/spacetimedb/src/core/seed";
import type { Flag, MandateRules, OfferInput, Tier } from "@/spacetimedb/src/core/types";

const mandate: MandateRules = { ...DEMO_MANDATE, categories: DEMO_MANDATE.categories.split(",") };
const offers = fixture.offers as unknown as OfferInput[];
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

describe("demo fixture (docs/PLAN.md section 12)", () => {
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
