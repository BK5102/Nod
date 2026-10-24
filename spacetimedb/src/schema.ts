import { schema, table, t } from 'spacetimedb/server';

// Money is integer cents in u32. Times are ISO strings derived from ctx.timestamp, never the wall clock.
// Nested records (rules) are JSON strings written only by reducers.
// Public tables carry no personal data: name, email, booking reference, loyalty number and card data
// live only in the private traveler_profile and payment_token tables.

/** The identity that published the module. Assigns the agent and operator seats. */
export const admin = table({ name: 'admin' }, { identity: t.identity().primaryKey() });

/** The traveler, the agent and the demo operator. Roles live here; identities bind to actors through seats. */
export const actor = table(
  { name: 'actor', public: true },
  { actorId: t.string().primaryKey(), name: t.string(), role: t.string() }
);

/** Which actor a connected identity is acting as. The only source of a caller's role. */
export const seat = table(
  { name: 'seat', public: true },
  { identity: t.identity().primaryKey(), actorId: t.string() }
);

export const trip = table(
  { name: 'trip', public: true },
  {
    tripId: t.string().primaryKey(),
    route: t.string(),
    flight: t.string(),
    departs: t.string(),
    deadlineText: t.string(),
    status: t.string(), // scheduled | canceled | options_ready | booked
    cancelReason: t.string(),
    canceledAt: t.string(),
    bookedAt: t.string(),
    fareCents: t.u32(),
    refundOwedCents: t.u32(),
    spendCents: t.u32(),
  }
);

/** The card's rules for the trip. No card data. */
export const mandate = table(
  { name: 'mandate', public: true },
  {
    tripId: t.string().primaryKey(),
    tripCapCents: t.u32(),
    askAboveCents: t.u32(),
    autoCeilingCents: t.u32(),
    categories: t.string(),
    summary: t.string(),
  }
);

export const offer = table(
  { name: 'offer', public: true },
  {
    offerId: t.string().primaryKey(),
    tripId: t.string(),
    kind: t.string(), // free_rebooking | flight | hotel
    merchant: t.string(),
    title: t.string(),
    departs: t.string(),
    arrives: t.string(),
    meetsDeadline: t.bool(),
    priceCents: t.u32(),
    refundable: t.bool(),
    category: t.string(),
    mcc: t.string(),
    rank: t.u32(), // 1, 2, 3...; 0 means set aside
    tier: t.string(), // AUTO | ASK | BLOCK
    rulesJson: t.string(),
    claudeReason: t.string(),
    flagged: t.bool(),
    flagReason: t.string(),
    quoteHash: t.string(),
    expiresAt: t.string(),
    status: t.string(), // open | booked | set_aside
  }
);

/** The agent's progress, one row per step, streamed to the traveler through subscriptions. */
export const agentStep = table(
  { name: 'agent_step', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    tripId: t.string(),
    seq: t.u32(),
    kind: t.string(), // info | search | decision | refusal | error
    text: t.string(),
    at: t.string(),
  }
);

/** Append-only and hash-chained. No reducer updates a receipt; only reset_demo clears the demo trip. */
export const receipt = table(
  { name: 'receipt', public: true },
  {
    seq: t.u32().primaryKey(),
    tripId: t.string(),
    action: t.string(),
    offerId: t.string(),
    merchant: t.string(),
    amountCents: t.u32(),
    tier: t.string(),
    rulesJson: t.string(),
    actor: t.string(),
    quoteHash: t.string(),
    tokenLast4: t.string(),
    at: t.string(),
    prevHash: t.string(),
    hash: t.string(),
  }
);

/** Private. Never sent to Claude, never copied into a public row. */
export const travelerProfile = table(
  { name: 'traveler_profile' },
  {
    tripId: t.string().primaryKey(),
    name: t.string(),
    email: t.string(),
    bookingRef: t.string(),
    loyaltyNumber: t.string(),
  }
);

/** Private mock card token (SIMULATED). Only last4 ever leaves this table, on receipts. */
export const paymentToken = table(
  { name: 'payment_token' },
  {
    tripId: t.string().primaryKey(),
    tokenRef: t.string(),
    last4: t.string(),
    capCents: t.u32(),
    allowedMccs: t.string(),
    expiresAt: t.string(),
  }
);

const spacetimedb = schema({
  admin,
  actor,
  seat,
  trip,
  mandate,
  offer,
  agentStep,
  receipt,
  travelerProfile,
  paymentToken,
});

export default spacetimedb;
