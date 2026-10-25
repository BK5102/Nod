import { t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import spacetimedb from './schema';
import { deadlineLabel, evaluateOffer, quoteHash, rankOffers } from './core/policy';
import { mergeFlags } from './core/tiers';
import { checkMockToken } from './core/token';
import { GENESIS_HASH, hashReceipt } from './core/receipt';
import { addMinutes, dollars } from './core/money';
import { CANCEL_REASON, DEMO_MANDATE, DEMO_PROFILE, DEMO_TOKEN, DEMO_TRIP, QUOTE_MINUTES } from './core/seed';
import type { Flag, MandateRules, OfferInput, OfferKind, RuleHit, Tier } from './core/types';

export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
type OfferRow = ReturnType<Ctx['db']['offer']['offerId']['find']> & {};
type TripRow = ReturnType<Ctx['db']['trip']['tripId']['find']> & {};

const ACTORS = [
  { actorId: 'act_traveler', name: 'Traveler', role: 'traveler' },
  { actorId: 'act_agent', name: 'Rerouted agent', role: 'agent' },
  { actorId: 'act_operator', name: 'Demo operator', role: 'operator' },
];
/** Seats only the admin can assign. */
const RESERVED = ['agent', 'operator'];
const STEP_KINDS = ['info', 'search', 'decision', 'refusal', 'error'];

// ------------------------------------------------------------------ helpers

function nowIso(ctx: Ctx): string {
  return new Date(Number(ctx.timestamp.microsSinceUnixEpoch / 1000n)).toISOString();
}

function isAdmin(ctx: Ctx): boolean {
  return !!ctx.db.admin.identity.find(ctx.sender);
}

/** The caller's actor, from its seat. Roles are never taken from arguments. */
function caller(ctx: Ctx) {
  const s = ctx.db.seat.identity.find(ctx.sender);
  return s ? (ctx.db.actor.actorId.find(s.actorId) ?? null) : null;
}

function requireRole(ctx: Ctx, roles: string[], action: string) {
  if (roles.includes('operator') && isAdmin(ctx)) return;
  const a = caller(ctx);
  if (!a || !roles.includes(a.role)) {
    throw new SenderError(`Refused: ${a ? `the ${a.role}` : 'an unseated identity'} cannot ${action}.`);
  }
}

function getTrip(ctx: Ctx, tripId: string): TripRow {
  const tr = ctx.db.trip.tripId.find(tripId);
  if (!tr) throw new SenderError(`No trip ${tripId}. Reset the demo first.`);
  return tr;
}

function mandateRules(ctx: Ctx, tripId: string): MandateRules {
  const m = ctx.db.mandate.tripId.find(tripId);
  if (!m) throw new SenderError(`No card rules for ${tripId}. Reset the demo first.`);
  return { tripCapCents: m.tripCapCents, askAboveCents: m.askAboveCents, autoCeilingCents: m.autoCeilingCents, categories: m.categories.split(',') };
}

function offersOf(ctx: Ctx, tripId: string): OfferRow[] {
  return [...ctx.db.offer.iter()].filter((o) => o.tripId === tripId);
}

function addStep(ctx: Ctx, tripId: string, kind: string, text: string) {
  const seq = [...ctx.db.agentStep.iter()].filter((s) => s.tripId === tripId).length + 1;
  ctx.db.agentStep.insert({ id: 0n, tripId, seq, kind, text, at: nowIso(ctx) });
}

function toInput(o: OfferRow): OfferInput {
  return {
    offerId: o.offerId,
    kind: o.kind as OfferKind,
    merchant: o.merchant,
    title: o.title,
    departs: o.departs,
    arrives: o.arrives,
    meetsDeadline: o.meetsDeadline,
    priceCents: o.priceCents,
    refundable: o.refundable,
    category: o.category,
    mcc: o.mcc,
  };
}

/** Runs the card's rules on one offer, keeping any Claude flag already on it (flags only raise). */
function retier(ctx: Ctx, tr: TripRow, o: OfferInput, all: readonly OfferInput[], keep: RuleHit[]) {
  const free = all.find((x) => x.kind === 'free_rebooking') ?? null;
  const ev = evaluateOffer(o, mandateRules(ctx, tr.tripId), {
    spendCents: tr.spendCents,
    freeOption: free && free.offerId !== o.offerId ? { merchant: free.merchant, meetsDeadline: free.meetsDeadline } : null,
    deadlineLabel: deadlineLabel(tr.deadlineText),
  });
  const flags: Flag[] = keep.map((r) => ({ severity: r.tier === 'BLOCK' ? 'BLOCK' : 'ASK', reason: r.reason }));
  return { tier: mergeFlags(ev.tier, flags), rules: [...ev.rules, ...keep] };
}

/** Recomputes ranks for every offer on the trip. BLOCK offers are set aside with rank 0. */
function rerank(ctx: Ctx, tripId: string) {
  const offers = offersOf(ctx, tripId);
  const ranks = rankOffers(offers.map((o) => ({ offerId: o.offerId, kind: o.kind, meetsDeadline: o.meetsDeadline, priceCents: o.priceCents, tier: o.tier as Tier })));
  for (const o of offers) {
    const rank = ranks.get(o.offerId) ?? 0;
    const status = o.status === 'booked' ? 'booked' : o.tier === 'BLOCK' ? 'set_aside' : 'open';
    if (rank !== o.rank || status !== o.status) ctx.db.offer.offerId.update({ ...o, rank, status });
  }
}

function flagHits(o: OfferRow): RuleHit[] {
  return (JSON.parse(o.rulesJson) as RuleHit[]).filter((r) => r.id === 'claude_flag');
}

function seedActors(ctx: Ctx) {
  for (const a of ACTORS) if (!ctx.db.actor.actorId.find(a.actorId)) ctx.db.actor.insert(a);
}

// ------------------------------------------------------------------ lifecycle and seats

export const init = spacetimedb.init((ctx) => {
  ctx.db.admin.insert({ identity: ctx.sender });
  seedActors(ctx);
});

/**
 * Any browser may take the traveler seat. Nobody can take the agent or operator seat this way, and an
 * identity seated as the agent or operator can never move to the traveler seat, so the agent can never
 * approve a purchase.
 */
export const takeSeat = spacetimedb.reducer({ actorId: t.string() }, (ctx, { actorId }) => {
  const target = ctx.db.actor.actorId.find(actorId);
  if (!target) throw new SenderError(`No actor ${actorId}`);
  if (RESERVED.includes(target.role)) throw new SenderError(`Refused: the ${target.role} seat is assigned by the admin only.`);
  const mine = ctx.db.seat.identity.find(ctx.sender);
  const myRole = mine ? ctx.db.actor.actorId.find(mine.actorId)?.role : undefined;
  if (myRole && RESERVED.includes(myRole)) throw new SenderError(`Refused: the ${myRole} identity cannot take the traveler seat.`);
  if (mine) ctx.db.seat.identity.update({ identity: ctx.sender, actorId });
  else ctx.db.seat.insert({ identity: ctx.sender, actorId });
});

/** Admin only: binds an identity to any seat, including the reserved agent and operator seats. */
export const assignSeat = spacetimedb.reducer({ who: t.identity(), actorId: t.string() }, (ctx, { who, actorId }) => {
  if (!isAdmin(ctx)) throw new SenderError('Refused: only the admin identity can assign seats.');
  seedActors(ctx);
  if (!ctx.db.actor.actorId.find(actorId)) throw new SenderError(`No actor ${actorId}`);
  const s = ctx.db.seat.identity.find(who);
  if (s) ctx.db.seat.identity.update({ identity: who, actorId });
  else ctx.db.seat.insert({ identity: who, actorId });
});

// ------------------------------------------------------------------ operator (demo controls, SIMULATED)

/** Clears the demo trip and seeds it again with the given flight (route, flight, departure, fare). */
function reseed(ctx: Ctx, trip: { route: string; flight: string; departs: string; deadlineText: string; fareCents: number }) {
  seedActors(ctx);
  const id = DEMO_TRIP.tripId;
  for (const o of offersOf(ctx, id)) ctx.db.offer.offerId.delete(o.offerId);
  for (const s of [...ctx.db.agentStep.iter()]) if (s.tripId === id) ctx.db.agentStep.id.delete(s.id);
  for (const r of [...ctx.db.receipt.iter()]) if (r.tripId === id) ctx.db.receipt.seq.delete(r.seq);
  ctx.db.trip.tripId.delete(id);
  ctx.db.mandate.tripId.delete(id);
  ctx.db.travelerProfile.tripId.delete(id);
  ctx.db.paymentToken.tripId.delete(id);

  ctx.db.trip.insert({ ...DEMO_TRIP, ...trip, status: 'scheduled', cancelReason: '', canceledAt: '', bookedAt: '', refundOwedCents: 0, spendCents: 0 });
  ctx.db.mandate.insert(DEMO_MANDATE);
  ctx.db.travelerProfile.insert(DEMO_PROFILE);
  ctx.db.paymentToken.insert(DEMO_TOKEN);
}

/** Clears the demo trip and seeds it again. One atomic reducer; never republish to reset. */
export const resetDemo = spacetimedb.reducer((ctx) => {
  requireRole(ctx, ['operator'], 'reset the demo');
  reseed(ctx, DEMO_TRIP);
});

/**
 * Resets the demo onto another real flight (picked by the server from a real search) and an arrive-by
 * time tomorrow. Same reset as reset_demo; only the trip's route, flight, departure, deadline and fare
 * change. The card rules stay.
 */
export const setTrip = spacetimedb.reducer(
  { route: t.string(), flight: t.string(), departs: t.string(), fareCents: t.u32(), deadline: t.string() },
  (ctx, { route, flight, departs, fareCents, deadline }) => {
    requireRole(ctx, ['operator'], 'change the demo flight');
    const m = route.match(/^[A-Z]{3} to ([A-Z]{3})$/);
    if (!m) throw new SenderError('Route must look like "SFO to JFK".');
    if (!flight.trim() || flight.length > 60 || !/^\d{1,2}:\d{2} (AM|PM)$/.test(departs)) throw new SenderError('Flight and departure ("4:15 PM") are required.');
    if (fareCents <= 0 || fareCents > 1_000_000) throw new SenderError('Fare must be between $0.01 and $10,000.');
    if (!/^\d{1,2}:\d{2} (AM|PM)$/.test(deadline)) throw new SenderError('Deadline must look like "9:00 AM".');
    reseed(ctx, { route, flight: flight.trim(), departs, deadlineText: `Arrive ${m[1]} by ${deadline}`, fareCents });
  }
);

/** SIMULATED cancellation. The refund for the canceled ticket is owed from this moment. */
export const cancelFlight = spacetimedb.reducer({ tripId: t.string() }, (ctx, { tripId }) => {
  requireRole(ctx, ['operator'], 'cancel a flight');
  const tr = getTrip(ctx, tripId);
  if (tr.status !== 'scheduled') throw new SenderError('This flight is already canceled. Reset the demo first.');
  ctx.db.trip.tripId.update({ ...tr, status: 'canceled', cancelReason: CANCEL_REASON, canceledAt: nowIso(ctx), refundOwedCents: tr.fareCents });
  addStep(ctx, tripId, 'info', `${tr.flight} was canceled: ${CANCEL_REASON}. Your ${dollars(tr.fareCents)} fare is owed back to you.`);
});

/** SIMULATED price change. New price, new rules, new quote hash: an approval of the old quote no longer works. */
export const setPrice = spacetimedb.reducer({ offerId: t.string(), priceCents: t.u32() }, (ctx, { offerId, priceCents }) => {
  requireRole(ctx, ['operator'], 'change a price');
  const o = ctx.db.offer.offerId.find(offerId);
  if (!o) throw new SenderError(`No offer ${offerId}`);
  if (o.status === 'booked') throw new SenderError('This option is already booked.');
  const tr = getTrip(ctx, o.tripId);
  const all = offersOf(ctx, o.tripId).map(toInput);
  const input = { ...toInput(o), priceCents };
  const { tier, rules } = retier(ctx, tr, input, all, flagHits(o));
  const expiresAt = addMinutes(nowIso(ctx), QUOTE_MINUTES);
  ctx.db.offer.offerId.update({ ...o, priceCents, tier, rulesJson: JSON.stringify(rules), expiresAt, quoteHash: quoteHash({ offerId, merchant: o.merchant, priceCents, expiresAt }) });
  rerank(ctx, o.tripId);
  addStep(ctx, o.tripId, 'info', `${o.merchant}'s price changed from ${dollars(o.priceCents)} to ${dollars(priceCents)}.`);
});

// ------------------------------------------------------------------ agent

export const logStep = spacetimedb.reducer({ tripId: t.string(), kind: t.string(), text: t.string() }, (ctx, a) => {
  requireRole(ctx, ['agent', 'operator'], 'write agent steps');
  if (!STEP_KINDS.includes(a.kind)) throw new SenderError(`Unknown step kind ${a.kind}`);
  getTrip(ctx, a.tripId);
  addStep(ctx, a.tripId, a.kind, a.text.slice(0, 400));
});

interface SubmittedOffer extends OfferInput {
  claudeReason?: string;
}

/**
 * The agent hands over what it found. The reducer, not the caller, decides tier, rank, quote hash
 * and expiry: any tier or rank in the JSON is ignored.
 */
export const submitOffers = spacetimedb.reducer({ tripId: t.string(), offersJson: t.string() }, (ctx, { tripId, offersJson }) => {
  requireRole(ctx, ['agent'], 'submit offers');
  const tr = getTrip(ctx, tripId);
  if (tr.status === 'scheduled') throw new SenderError('The flight has not been canceled.');
  if (tr.status === 'booked') throw new SenderError('This trip is already booked.');
  let parsed: SubmittedOffer[];
  try {
    parsed = JSON.parse(offersJson) as SubmittedOffer[];
  } catch {
    throw new SenderError('offersJson is not valid JSON');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new SenderError('No offers submitted');
  const all: OfferInput[] = parsed.map((p) => ({
    offerId: String(p.offerId),
    kind: (['free_rebooking', 'flight', 'hotel'].includes(p.kind) ? p.kind : 'flight') as OfferKind,
    merchant: String(p.merchant),
    title: String(p.title),
    departs: String(p.departs ?? ''),
    arrives: String(p.arrives ?? ''),
    meetsDeadline: !!p.meetsDeadline,
    priceCents: Math.max(0, Math.round(Number(p.priceCents) || 0)),
    refundable: !!p.refundable,
    category: String(p.category),
    mcc: String(p.mcc),
  }));

  for (const o of offersOf(ctx, tripId)) ctx.db.offer.offerId.delete(o.offerId);
  const expiresAt = addMinutes(nowIso(ctx), QUOTE_MINUTES);
  all.forEach((o, i) => {
    const { tier, rules } = retier(ctx, tr, o, all, []);
    ctx.db.offer.insert({
      ...o,
      tripId,
      rank: 0,
      tier,
      rulesJson: JSON.stringify(rules),
      claudeReason: String(parsed[i]!.claudeReason ?? '').slice(0, 300),
      flagged: false,
      flagReason: '',
      quoteHash: quoteHash({ offerId: o.offerId, merchant: o.merchant, priceCents: o.priceCents, expiresAt }),
      expiresAt,
      status: 'open',
    });
  });
  rerank(ctx, tripId);
  ctx.db.trip.tripId.update({ ...tr, status: 'options_ready' });
});

/** A Claude flag. It can only raise the tier; BLOCK sets the offer aside. */
export const flagOffer = spacetimedb.reducer({ offerId: t.string(), severity: t.string(), reason: t.string() }, (ctx, a) => {
  requireRole(ctx, ['agent'], 'flag offers');
  const o = ctx.db.offer.offerId.find(a.offerId);
  if (!o) throw new SenderError(`No offer ${a.offerId}`);
  if (o.status === 'booked') throw new SenderError('This option is already booked.');
  const severity: Flag['severity'] = a.severity === 'BLOCK' ? 'BLOCK' : 'ASK';
  const reason = a.reason.slice(0, 300);
  const tier = mergeFlags(o.tier as Tier, [{ severity, reason }]);
  const rules = [...(JSON.parse(o.rulesJson) as RuleHit[]), { id: 'claude_flag', tier: severity, reason }];
  ctx.db.offer.offerId.update({ ...o, tier, rulesJson: JSON.stringify(rules), flagged: true, flagReason: reason });
  rerank(ctx, o.tripId);
});

// ------------------------------------------------------------------ traveler

/**
 * Approve and pay in one atomic transaction. Every check runs first; any failure throws and nothing
 * changes. The approval covers exactly one quote hash, so a changed price needs a new yes.
 */
export const approveOffer = spacetimedb.reducer({ offerId: t.string(), quoteHash: t.string() }, (ctx, a) => {
  const who = caller(ctx);
  if (!who) throw new SenderError('Refused: take the traveler seat first.');
  if (who.role === 'agent') throw new SenderError('Refused: the agent cannot approve its own purchase.');
  if (who.role !== 'traveler') throw new SenderError('Refused: only the traveler can approve a purchase.');

  const o = ctx.db.offer.offerId.find(a.offerId);
  if (!o) throw new SenderError(`No offer ${a.offerId}`);
  if (o.status === 'booked') throw new SenderError('This option is already booked.');
  const rules = JSON.parse(o.rulesJson) as RuleHit[];
  if (o.tier === 'BLOCK') {
    const first = rules.find((r) => r.tier === 'BLOCK');
    throw new SenderError(`Refused: this option is blocked. ${first?.reason ?? ''}`.trim());
  }
  if (a.quoteHash !== o.quoteHash) throw new SenderError(`The price changed to ${dollars(o.priceCents)}. Approve the new price to continue.`);
  const now = nowIso(ctx);
  if (now > o.expiresAt) throw new SenderError('This price expired. Ask the agent for a fresh quote.');

  const tr = getTrip(ctx, o.tripId);
  const m = mandateRules(ctx, o.tripId);
  const total = tr.spendCents + o.priceCents;
  if (total > m.tripCapCents) {
    throw new SenderError(`Refused: this would take the trip to ${dollars(total)}, over your ${dollars(m.tripCapCents)} cap.`);
  }
  const isFlight = o.kind !== 'hotel';
  if (isFlight && offersOf(ctx, o.tripId).some((x) => x.status === 'booked' && x.kind !== 'hotel')) {
    throw new SenderError('You already have a flight booked for this trip.');
  }
  const token = ctx.db.paymentToken.tripId.find(o.tripId);
  if (!token) throw new SenderError('Refused: no card on file for this trip.');
  const check = checkMockToken(
    { last4: token.last4, capCents: token.capCents, allowedMccs: token.allowedMccs.split(','), expiresAt: token.expiresAt },
    tr.spendCents,
    o.priceCents,
    o.mcc,
    now
  );
  if (!check.ok) throw new SenderError(check.reason);

  // Every check passed: book, update the trip, append the receipt.
  ctx.db.offer.offerId.update({ ...o, status: 'booked' });
  ctx.db.trip.tripId.update({ ...tr, spendCents: total, status: isFlight ? 'booked' : tr.status, bookedAt: isFlight && !tr.bookedAt ? now : tr.bookedAt });

  const prev = [...ctx.db.receipt.iter()].sort((x, y) => y.seq - x.seq)[0] ?? null;
  const body = {
    seq: (prev?.seq ?? 0) + 1,
    tripId: o.tripId,
    action: 'booked',
    offerId: o.offerId,
    merchant: o.merchant,
    amountCents: o.priceCents,
    tier: o.tier,
    rulesJson: o.rulesJson,
    actor: 'traveler',
    quoteHash: o.quoteHash,
    tokenLast4: token.last4,
    at: now,
  };
  const prevHash = prev?.hash ?? GENESIS_HASH;
  ctx.db.receipt.insert({ ...body, prevHash, hash: hashReceipt(prevHash, body) });
  addStep(ctx, o.tripId, 'decision', `Booked ${o.title} for ${dollars(o.priceCents)} on the card ending ${token.last4}. You approved this exact price.`);
});
