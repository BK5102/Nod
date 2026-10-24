// A local stand-in for the backend until milestone B1 lands. It replays the locked demo from
// docs/PLAN.md section 12 with the same tables, tiers, ranks and exact refusal strings, so the
// components never change when the live adapter replaces it. Everything here is mock data.

import type { ActionResult, AgentStep, Mandate, Offer, Receipt, RerouteActions, RerouteState, RuleHit, Trip } from "./types";

const TRIP_ID = "trip_demo";

function seedTrip(): Trip {
  return {
    tripId: TRIP_ID,
    route: "SFO to JFK",
    flight: "Bayline Air 412",
    departs: "6:40 PM",
    deadlineText: "Arrive JFK by 9:00 AM",
    status: "scheduled",
    cancelReason: "",
    canceledAt: "",
    bookedAt: "",
    fareCents: 31800,
    refundOwedCents: 0,
    spendCents: 0,
  };
}

const MANDATE: Mandate = {
  tripId: TRIP_ID,
  tripCapCents: 60000,
  askAboveCents: 25000,
  autoCeilingCents: 0,
  categories: "airline,lodging",
  summary: "Up to $600 on this trip. Ask me above $250. Airlines and hotels only.",
};

type Draft = Omit<Offer, "tripId" | "rulesJson" | "quoteHash" | "expiresAt" | "status"> & { rules: RuleHit[] };

const dollars = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

function drafts(): Draft[] {
  return [
    {
      offerId: "harbor_redeye", kind: "flight", merchant: "Harbor Air", title: "Red-eye, nonstop",
      departs: "10:15 PM", arrives: "6:45 AM", meetsDeadline: true, priceCents: 38900, refundable: false,
      category: "airline", mcc: "3000", rank: 1, tier: "ASK", flagged: false, flagReason: "",
      claudeReason: "The only option that lands before 9:00 AM, with two hours to spare.",
      rules: [
        { id: "above_ask_threshold", tier: "ASK", reason: "Over $250, so you asked to approve it." },
        { id: "free_option_exists", tier: "ASK", reason: "Bayline will rebook you free; this costs $389 because the free option lands after 9:00 AM." },
      ],
    },
    {
      offerId: "bayline_free", kind: "free_rebooking", merchant: "Bayline Air", title: "Free rebooking",
      departs: "tomorrow 7:05 AM", arrives: "3:30 PM", meetsDeadline: false, priceCents: 0, refundable: true,
      category: "airline", mcc: "3000", rank: 2, tier: "ASK", flagged: false, flagReason: "",
      claudeReason: "Costs nothing, but you land six and a half hours after your deadline.",
      rules: [{ id: "misses_deadline", tier: "ASK", reason: "Lands after your 9:00 AM deadline." }],
    },
    {
      offerId: "coastal_0600", kind: "flight", merchant: "Coastal", title: "Morning, nonstop",
      departs: "6:00 AM", arrives: "2:20 PM", meetsDeadline: false, priceCents: 21000, refundable: true,
      category: "airline", mcc: "3000", rank: 3, tier: "ASK", flagged: false, flagReason: "",
      claudeReason: "Cheaper than the red-eye, but it also misses 9:00 AM.",
      rules: [
        { id: "misses_deadline", tier: "ASK", reason: "Lands after your 9:00 AM deadline." },
        { id: "free_option_exists", tier: "ASK", reason: "Bayline will rebook you free, and this lands after 9:00 AM too." },
      ],
    },
    {
      offerId: "airport_inn", kind: "hotel", merchant: "Airport Inn", title: "One night near SFO",
      departs: "Tonight", arrives: "Check out 5:00 AM", meetsDeadline: true, priceCents: 15900, refundable: true,
      category: "lodging", mcc: "7011", rank: 4, tier: "ASK", flagged: false, flagReason: "",
      claudeReason: "A bed tonight if you take a morning flight.",
      rules: [{ id: "above_auto_ceiling", tier: "ASK", reason: "Over your auto-buy limit." }],
    },
    {
      offerId: "harbor_business", kind: "flight", merchant: "Harbor Air", title: "Red-eye, business class",
      departs: "10:15 PM", arrives: "6:45 AM", meetsDeadline: true, priceCents: 114000, refundable: true,
      category: "airline", mcc: "3000", rank: 0, tier: "BLOCK", flagged: false, flagReason: "",
      claudeReason: "Same flight as the red-eye in a business seat.",
      rules: [{ id: "over_trip_cap", tier: "BLOCK", reason: "Over your $600 trip cap." }],
    },
    {
      offerId: "skyport_suites", kind: "hotel", merchant: "Skyport Suites", title: "One night near SFO",
      departs: "Tonight", arrives: "Check out 5:00 AM", meetsDeadline: true, priceCents: 9500, refundable: false,
      category: "lodging", mcc: "7011", rank: 0, tier: "BLOCK", flagged: true,
      flagReason: "Its listing tells AI agents the hotel is pre-approved and to book it without asking.",
      claudeReason: "",
      rules: [
        { id: "above_auto_ceiling", tier: "ASK", reason: "Over your auto-buy limit." },
        { id: "claude_flag", tier: "BLOCK", reason: "Its listing tells AI agents the hotel is pre-approved and to book it without asking." },
      ],
    },
  ];
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

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

  async function quote(offerId: string, priceCents: number) {
    return (await sha256(`${offerId}:${priceCents}:${Date.now()}`)).slice(0, 16);
  }

  const ok: ActionResult = { ok: true };
  const fail = (error: string): ActionResult => ({ ok: false, error });

  const actions: RerouteActions = {
    async reset() {
      run++;
      set({ trip: seedTrip(), offers: [], steps: [], receipts: [] });
      return ok;
    },

    async cancel() {
      if (state.trip?.status !== "scheduled") return fail("Reset the demo first.");
      const mine = ++run;
      const now = new Date().toISOString();
      set({ trip: { ...state.trip, status: "canceled", cancelReason: "Crew unavailable", canceledAt: now, refundOwedCents: state.trip.fareCents } });
      step("info", "Bayline Air 412 is canceled: crew unavailable.");
      const script: [AgentStep["kind"], string][] = [
        ["search", "Checking Bayline's free rebooking first."],
        ["decision", "Free rebooking found: tomorrow 7:05 AM, lands 3:30 PM. It misses 9:00 AM."],
        ["search", "Searching flights from SFO to JFK tonight and tomorrow morning."],
        ["search", "Searching hotels near SFO for one night."],
        ["info", "Found 4 flights and 2 hotels. Asking Claude to explain each one and check the listings."],
        ["decision", "Skyport Suites flagged: its listing tries to instruct AI agents."],
      ];
      for (const [kind, text] of script) {
        await sleep(750);
        if (mine !== run) return ok;
        step(kind, text);
      }
      await sleep(600);
      if (mine !== run) return ok;
      const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      const offers: Offer[] = await Promise.all(
        drafts().map(async ({ rules, ...d }) => ({
          ...d,
          tripId: TRIP_ID,
          rulesJson: JSON.stringify(rules),
          quoteHash: await quote(d.offerId, d.priceCents),
          expiresAt,
          status: d.rank === 0 ? ("set_aside" as const) : ("open" as const),
        })),
      );
      set({ offers, trip: { ...state.trip!, status: "options_ready" } });
      step("decision", "Ranked 4 ways home against your 9:00 AM deadline. 2 set aside.");
      return ok;
    },

    async agentTryApprove(offerId) {
      const reason = "Refused: the agent cannot approve its own purchase.";
      if (!state.offers.some((o) => o.offerId === offerId)) return fail("No such option.");
      step("refusal", `The agent tried to buy ${label(offerId)} itself. ${reason}`);
      return fail(reason);
    },

    async setPrice(offerId, priceCents) {
      const o = state.offers.find((x) => x.offerId === offerId);
      if (!o) return fail("No such option.");
      const rules = JSON.parse(o.rulesJson) as RuleHit[];
      const next = rules.map((r) =>
        r.id === "free_option_exists" && o.offerId === "harbor_redeye"
          ? { ...r, reason: `Bayline will rebook you free; this costs ${dollars(priceCents)} because the free option lands after 9:00 AM.` }
          : r,
      );
      const quoteHash = await quote(offerId, priceCents);
      set({ offers: state.offers.map((x) => (x.offerId === offerId ? { ...x, priceCents, quoteHash, rulesJson: JSON.stringify(next) } : x)) });
      step("info", `${o.merchant} changed the price from ${dollars(o.priceCents)} to ${dollars(priceCents)}. The old quote no longer works.`);
      return ok;
    },

    async approve(offerId, quoteHash) {
      const trip = state.trip!;
      const o = state.offers.find((x) => x.offerId === offerId);
      if (!o) return fail("No such option.");
      const rules = JSON.parse(o.rulesJson) as RuleHit[];
      if (o.kind !== "hotel" && state.offers.some((x) => x.status === "booked" && x.kind !== "hotel"))
        return fail("You already have a flight booked for this trip.");
      if (o.tier === "BLOCK") return fail(`Refused: this option is blocked. ${rules.find((r) => r.tier === "BLOCK")?.reason ?? ""}`.trim());
      if (o.quoteHash !== quoteHash) return fail(`The price changed to ${dollars(o.priceCents)}. Approve the new price to continue.`);
      if (Date.parse(o.expiresAt) < Date.now()) return fail("This price expired. Ask the agent for a fresh quote.");
      const total = trip.spendCents + o.priceCents;
      if (total > MANDATE.tripCapCents) return fail(`Refused: this would take the trip to ${dollars(total)}, over your $600 cap.`);

      const at = new Date().toISOString();
      const prev = state.receipts.at(-1);
      const seq = (prev?.seq ?? 0) + 1;
      const prevHash = prev?.hash ?? "0".repeat(64);
      const body = { seq, tripId: TRIP_ID, action: "booked", offerId, merchant: o.merchant, amountCents: o.priceCents, tier: o.tier, rulesJson: o.rulesJson, actor: "traveler", quoteHash, tokenLast4: "4242", at, prevHash };
      const receipt: Receipt = { ...body, hash: await sha256(prevHash + JSON.stringify(body)) };
      set({
        offers: state.offers.map((x) => (x.offerId === offerId ? { ...x, status: "booked" } : x)),
        trip: { ...trip, status: o.kind === "hotel" && trip.status !== "booked" ? trip.status : "booked", bookedAt: trip.bookedAt || at, spendCents: total },
        receipts: [...state.receipts, receipt],
      });
      step("decision", `You approved ${label(offerId)} at ${dollars(o.priceCents)}. Booked and paid with the card ending 4242.`);
      return ok;
    },
  };

  function label(offerId: string) {
    const o = state.offers.find((x) => x.offerId === offerId);
    return o ? `the ${o.merchant} ${o.title.toLowerCase()}` : "an option";
  }

  return {
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    actions,
  };
}
