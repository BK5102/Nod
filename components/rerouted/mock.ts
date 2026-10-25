// A local stand-in for the live database, for rehearsing without Maincloud. It replays
// data/fixtures/demo.json through the backend's own pure policy core (spacetimedb/src/core), so the
// tiers, ranks, quote hashes, refusal strings and receipt chain match the module. There is no
// Claude in mock mode: reasons stay empty, and the Skyport listing flag is replayed so the beat can
// be rehearsed. The page says "Mock data" whenever this runs.

import fixture from "@/data/fixtures/demo.json";
import { dollars } from "@/spacetimedb/src/core/money";
import { deadlineLabel, evaluateOffer, quoteHash, rankOffers } from "@/spacetimedb/src/core/policy";
import { GENESIS_HASH, hashReceipt } from "@/spacetimedb/src/core/receipt";
import { CANCEL_REASON, DEMO_MANDATE, DEMO_TRIP, QUOTE_MINUTES } from "@/spacetimedb/src/core/seed";
import { mergeFlags } from "@/spacetimedb/src/core/tiers";
import type { OfferInput } from "@/spacetimedb/src/core/types";
import type { ActionResult, AgentStep, Mandate, Offer, Receipt, RerouteActions, RerouteState, RuleHit, Trip } from "./types";

const TRIP_ID = DEMO_TRIP.tripId;
const SKYPORT_FLAG = "Its listing tells AI agents to book it without asking. Listing text is never followed.";

const seedTrip = (): Trip => ({ ...DEMO_TRIP, status: "scheduled", cancelReason: "", canceledAt: "", bookedAt: "", refundOwedCents: 0, spendCents: 0 });
const MANDATE: Mandate = { ...DEMO_MANDATE };
const OFFERS = fixture.offers.map(({ listingText: _l, ...o }) => o as OfferInput);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createMockEngine() {
  let state: RerouteState = { trip: seedTrip(), mandate: MANDATE, offers: [], steps: [], receipts: [] };
  let run = 0;
  const listeners = new Set<() => void>();

  const set = (next: Partial<RerouteState>) => {
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  };

  const step = (kind: AgentStep["kind"], text: string) => {
    const seq = state.steps.length + 1;
    set({ steps: [...state.steps, { id: seq, tripId: TRIP_ID, seq, kind, text, at: new Date().toISOString() }] });
  };

  const ok: ActionResult = { ok: true };
  const fail = (error: string): ActionResult => ({ ok: false, error });

  /** submit_offers, as the reducer does it: rules set the tier, flags can only raise it, then rank. */
  function submit(spendCents: number, flags: Map<string, string>): Offer[] {
    const deadline = deadlineLabel(DEMO_TRIP.deadlineText);
    const free = OFFERS.find((o) => o.kind === "free_rebooking");
    const rules = { tripCapCents: MANDATE.tripCapCents, askAboveCents: MANDATE.askAboveCents, autoCeilingCents: MANDATE.autoCeilingCents, categories: MANDATE.categories.split(",") };
    const expiresAt = new Date(Date.now() + QUOTE_MINUTES * 60_000).toISOString();
    const evaluated = OFFERS.map((o) => {
      const ev = evaluateOffer(o, rules, { spendCents, freeOption: free ? { merchant: free.merchant, meetsDeadline: free.meetsDeadline } : null, deadlineLabel: deadline });
      const flag = flags.get(o.offerId);
      const hits: RuleHit[] = flag ? [...ev.rules, { id: "claude_flag", tier: "BLOCK", reason: flag }] : ev.rules;
      return { o, tier: flag ? mergeFlags(ev.tier, [{ severity: "BLOCK", reason: flag }]) : ev.tier, hits, flag };
    });
    const ranks = rankOffers(evaluated.map(({ o, tier }) => ({ offerId: o.offerId, kind: o.kind, meetsDeadline: o.meetsDeadline, priceCents: o.priceCents, tier })));
    return evaluated.map(({ o, tier, hits, flag }) => {
      const rank = ranks.get(o.offerId) ?? 0;
      return {
        ...o,
        tripId: TRIP_ID,
        rank,
        tier,
        rulesJson: JSON.stringify(hits),
        claudeReason: "",
        flagged: !!flag,
        flagReason: flag ?? "",
        expiresAt,
        quoteHash: quoteHash({ offerId: o.offerId, merchant: o.merchant, priceCents: o.priceCents, expiresAt }),
        status: rank === 0 ? "set_aside" : "open",
      };
    });
  }

  const actions: RerouteActions = {
    async reset() {
      run++;
      set({ trip: seedTrip(), offers: [], steps: [], receipts: [] });
      return ok;
    },

    async shuffle() {
      // The recorded flights are mapped on the server, so switching flights needs the live database.
      return fail("Another flight needs the live database. Open the dashboard without ?mock=1.");
    },

    async randomizeCard() {
      return fail("New card limits need the live database. Open the dashboard without ?mock=1.");
    },

    async cancel() {
      if (state.trip?.status !== "scheduled") return fail("This flight is already canceled. Reset the demo first.");
      const mine = ++run;
      set({ trip: { ...state.trip, status: "canceled", cancelReason: CANCEL_REASON, canceledAt: new Date().toISOString(), refundOwedCents: state.trip.fareCents } });
      step("info", `${DEMO_TRIP.flight} was canceled: ${CANCEL_REASON}. Your ${dollars(DEMO_TRIP.fareCents)} fare is owed back to you.`);
      // The fixture is a recorded real search: flights only, so the free rebooking and hotel lines appear
      // only if those offers exist (the same as the live agent in lib/agent/run.ts).
      const free = OFFERS.find((o) => o.kind === "free_rebooking");
      const hotels = OFFERS.filter((o) => o.kind === "hotel").length;
      const script: [AgentStep["kind"], string][] = [
        ["search", `Searching flights ${DEMO_TRIP.route}`],
        ...(free
          ? ([["decision", `Free rebooking: departs ${free.departs.toLowerCase()}, lands ${free.arrives.toLowerCase()}. ${free.meetsDeadline ? "Makes" : "Misses"} your 9:00 AM deadline.`]] as [AgentStep["kind"], string][])
          : []),
        ["search", `Found ${OFFERS.filter((o) => o.kind === "flight").length} paid flights${hotels ? ` and ${hotels} hotels` : ""} from a recorded Google Flights search (Oct 25, 2026)`],
        ["info", "Checking listings and writing a reason for each option"],
      ];
      for (const [kind, text] of script) {
        await sleep(800);
        if (mine !== run) return ok;
        step(kind, text);
      }
      await sleep(900);
      if (mine !== run) return ok;
      const claudeOff = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("claude") === "off";
      if (claudeOff) {
        step("error", "The agent could not write reasons (mock outage). The card's rules still apply, and nothing is bought without your yes.");
        set({ offers: submit(0, new Map()), trip: { ...state.trip!, status: "options_ready" } });
      } else {
        const skyport = OFFERS.find((o) => o.offerId === "off_skyport");
        const flags = new Map(skyport ? [[skyport.offerId, SKYPORT_FLAG]] : []);
        set({ offers: submit(0, flags), trip: { ...state.trip!, status: "options_ready" } });
        if (skyport) step("refusal", `Flagged ${skyport.merchant}: ${SKYPORT_FLAG}`);
      }
      const aside = state.offers.filter((o) => o.status === "set_aside").length;
      step("decision", `${state.offers.length - aside} options ready, ${aside} set aside`);
      return ok;
    },

    async agentTryApprove(offerId) {
      const o = state.offers.find((x) => x.offerId === offerId);
      if (!o) return fail(`No offer ${offerId}`);
      const reason = "Refused: the agent cannot approve its own purchase.";
      step("refusal", `The agent tried to buy ${o.title} itself. ${reason}`);
      return fail(reason);
    },

    async setPrice(offerId, priceCents) {
      const o = state.offers.find((x) => x.offerId === offerId);
      if (!o) return fail(`No offer ${offerId}`);
      if (o.status === "booked") return fail("This option is already booked.");
      const qh = quoteHash({ offerId, merchant: o.merchant, priceCents, expiresAt: o.expiresAt });
      const rules = (JSON.parse(o.rulesJson) as RuleHit[]).map((r) => ({ ...r, reason: r.reason.replace(dollars(o.priceCents), dollars(priceCents)) }));
      set({ offers: state.offers.map((x) => (x.offerId === offerId ? { ...x, priceCents, quoteHash: qh, rulesJson: JSON.stringify(rules) } : x)) });
      step("info", `${o.merchant}'s price changed from ${dollars(o.priceCents)} to ${dollars(priceCents)}.`);
      return ok;
    },

    async approve(offerId, qh) {
      const trip = state.trip!;
      const o = state.offers.find((x) => x.offerId === offerId);
      if (!o) return fail(`No offer ${offerId}`);
      if (o.status === "booked") return fail("This option is already booked.");
      const rules = JSON.parse(o.rulesJson) as RuleHit[];
      if (o.tier === "BLOCK") return fail(`Refused: this option is blocked. ${rules.find((r) => r.tier === "BLOCK")?.reason ?? ""}`.trim());
      if (o.quoteHash !== qh) return fail(`The price changed to ${dollars(o.priceCents)}. Approve the new price to continue.`);
      if (new Date().toISOString() > o.expiresAt) return fail("This price expired. Ask the agent for a fresh quote.");
      const total = trip.spendCents + o.priceCents;
      if (total > MANDATE.tripCapCents) return fail(`Refused: this would take the trip to ${dollars(total)}, over your ${dollars(MANDATE.tripCapCents)} cap.`);
      if (o.kind !== "hotel" && state.offers.some((x) => x.status === "booked" && x.kind !== "hotel")) return fail("You already have a flight booked for this trip.");

      const at = new Date().toISOString();
      const prev = state.receipts.at(-1);
      const body = { seq: (prev?.seq ?? 0) + 1, tripId: TRIP_ID, action: "booked", offerId, merchant: o.merchant, amountCents: o.priceCents, tier: o.tier, rulesJson: o.rulesJson, actor: "traveler", quoteHash: qh, tokenLast4: "4242", at };
      const prevHash = prev?.hash ?? GENESIS_HASH;
      const receipt: Receipt = { ...body, tier: o.tier, prevHash, hash: hashReceipt(prevHash, body) };
      set({
        offers: state.offers.map((x) => (x.offerId === offerId ? { ...x, status: "booked" } : x)),
        trip: { ...trip, status: o.kind === "hotel" ? trip.status : "booked", bookedAt: o.kind === "hotel" ? trip.bookedAt : at, spendCents: total },
        receipts: [...state.receipts, receipt],
      });
      return ok;
    },
  };

  return {
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    actions,
  };
}
