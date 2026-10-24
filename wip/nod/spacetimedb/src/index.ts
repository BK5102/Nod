import { t, SenderError } from 'spacetimedb/server';
import spacetimedb, { paymentIntent } from './schema';
import {
  audit,
  caller,
  changeBank,
  clock,
  closePeriod,
  controllerConfirm,
  escalate,
  failPayment,
  ingest,
  isAdmin,

  recordApproval,
  requireAdmin,
  requireRole,
  settle,
  sweepStalls,
  type Ctx,
} from './ops';
import { openingEntry, ACCOUNTS } from './core/ledger';
import { AUTO_PAY_MANDATE_CENTS, EARNED_AUTONOMY } from './core/autonomy';
import { verifyChain } from './core/chain';
import type { Receipt, RuleResult, Tier } from './core/types';

export default spacetimedb;

/** Seats only the admin can assign. */
const RESERVED = ['agent', 'operator'];

// ------------------------------------------------------------------ lifecycle

export const init = spacetimedb.init((ctx) => {
  ctx.db.admin.insert({ identity: ctx.sender });
});

// ------------------------------------------------------------------ seats (identity -> actor)

/**
 * Anyone may sit in a human seat for the demo (approver, controller, auditor). Nobody can take the
 * agent seat this way, and an identity seated as the agent can never move to a human seat, so the
 * agent can request payments but never approve them.
 */
export const takeSeat = spacetimedb.reducer({ actorId: t.string() }, (ctx, { actorId }) => {
  const target = ctx.db.actor.actorId.find(actorId);
  if (!target) throw new SenderError(`No actor ${actorId}`);
  if (RESERVED.includes(target.role)) throw new SenderError(`Refused: the ${target.role} seat is assigned by the admin only`);
  const mine = ctx.db.seat.identity.find(ctx.sender);
  const myRole = mine ? ctx.db.actor.actorId.find(mine.actorId)?.role : undefined;
  if (myRole && RESERVED.includes(myRole)) {
    throw new SenderError(`Refused: the ${myRole} identity cannot take a human seat`);
  }
  if (mine) ctx.db.seat.identity.update({ identity: ctx.sender, actorId });
  else ctx.db.seat.insert({ identity: ctx.sender, actorId });
});

export const leaveSeat = spacetimedb.reducer((ctx) => {
  const mine = ctx.db.seat.identity.find(ctx.sender);
  const role = mine ? ctx.db.actor.actorId.find(mine.actorId)?.role : undefined;
  if (mine && role && !RESERVED.includes(role)) ctx.db.seat.identity.delete(ctx.sender);
});

/** Admin only: binds an identity to any seat, including the reserved agent and operator seats. */
export const assignSeat = spacetimedb.reducer({ who: t.identity(), actorId: t.string() }, (ctx, { who, actorId }) => {
  requireAdmin(ctx);
  if (!ctx.db.actor.actorId.find(actorId)) throw new SenderError(`No actor ${actorId}`);
  const s = ctx.db.seat.identity.find(who);
  if (s) ctx.db.seat.identity.update({ identity: who, actorId });
  else ctx.db.seat.insert({ identity: who, actorId });
});

/** Demo controls (clock, bank outage, canaries) need the admin or the operator seat. */
function requireOperator(ctx: Ctx) {
  if (isAdmin(ctx)) return;
  requireRole(ctx, 'operator', 'use the simulation controls');
}

/**
 * Refused reducer calls roll back, so they cannot write their own audit row. The caller records the
 * refusal here afterwards, under its own identity, so every denied attempt is on the record.
 */
export const logDenied = spacetimedb.reducer({ action: t.string(), target: t.string(), detail: t.string() }, (ctx, a) => {
  const who = caller(ctx);
  audit(ctx, who?.actorId ?? 'unseated', 'denied', a.target, false, `${who ? who.name : 'An unseated identity'} tried to ${a.action}. ${a.detail}`);
});

// ------------------------------------------------------------------ agent

const ingestArgs = {
  invoiceId: t.string(),
  extractedJson: t.string(),
  rawText: t.string(),
  sourceFormat: t.string(),
  filePath: t.string(),
  extractionMethod: t.string(),
  handoffJson: t.string(),
};

export const submitInvoice = spacetimedb.reducer(ingestArgs, (ctx, a) => {
  requireRole(ctx, 'agent', 'take in invoices');
  ingest(ctx, a, false);
});

export const escalateInvoice = spacetimedb.reducer({ invoiceId: t.string(), claudeJson: t.string() }, (ctx, a) => {
  requireRole(ctx, 'agent', 'record the second review');
  escalate(ctx, a.invoiceId, a.claudeJson);
});

export const settlePayment = spacetimedb.reducer({ invoiceId: t.string(), externalId: t.string(), adapter: t.string() }, (ctx, a) => {
  requireRole(ctx, 'agent', 'settle a payment');
  settle(ctx, a.invoiceId, a.externalId, a.adapter);
});

export const paymentFailed = spacetimedb.reducer({ invoiceId: t.string(), adapter: t.string(), error: t.string() }, (ctx, a) => {
  requireRole(ctx, 'agent', 'report a bank failure');
  failPayment(ctx, a.invoiceId, a.adapter, a.error);
});

export const sweep = spacetimedb.reducer((ctx) => {
  if (!isAdmin(ctx)) requireRole(ctx, 'agent', 'chase stalled approvals');
  sweepStalls(ctx);
});

// ------------------------------------------------------------------ approver and controller

export const approve = spacetimedb.reducer(
  { invoiceId: t.string(), samples: t.array(t.f64()), latencyMs: t.u32() },
  (ctx, a) => {
    recordApproval(ctx, a.invoiceId, a.samples, a.latencyMs);
  }
);

export const controllerDecision = spacetimedb.reducer({ invoiceId: t.string(), outcome: t.string(), note: t.string() }, (ctx, a) => {
  controllerConfirm(ctx, a.invoiceId, a.outcome, a.note);
});

export const updateVendorBank = spacetimedb.reducer({ vendorId: t.string(), last4: t.string() }, (ctx, a) => {
  const who = requireRole(ctx, 'controller', 'change vendor bank details');
  const v = ctx.db.vendor.vendorId.find(a.vendorId);
  if (!v) throw new SenderError('No such vendor');
  changeBank(ctx, who.actorId, v, a.last4, 'by the controller');
});

export const closeBooks = spacetimedb.reducer({ period: t.string() }, (ctx, a) => {
  closePeriod(ctx, a.period);
});

// ------------------------------------------------------------------ admin: seeding and demo controls

interface CompanyJson {
  as_of: string;
  opening_balance_cents: number;
  actors: { id: string; name: string; role: string }[];
  vendors: {
    id: string; name: string; category: string; expense_account: string; bank_last4: string;
    bank_changed_at: string | null; heightened_until: string | null; first_seen_at: string; email_domain: string;
  }[];
  contracts: { id: string; vendor_id: string }[];
  purchase_orders: { id: string; vendor_id: string; number: string; amount_cents: number; description: string; status: string; created_at: string }[];
}

function wipe(ctx: Ctx) {
  for (const r of [...ctx.db.receipt.iter()]) ctx.db.receipt.seq.delete(r.seq);
  for (const r of [...ctx.db.journalLine.iter()]) ctx.db.journalLine.id.delete(r.id);
  for (const r of [...ctx.db.journalEntry.iter()]) ctx.db.journalEntry.id.delete(r.id);
  for (const r of [...ctx.db.bankTransfer.iter()]) ctx.db.bankTransfer.id.delete(r.id);
  for (const r of [...ctx.db.paymentIntent.iter()]) ctx.db.paymentIntent.invoiceId.delete(r.invoiceId);
  for (const r of [...ctx.db.controllerCheck.iter()]) ctx.db.controllerCheck.id.delete(r.id);
  for (const r of [...ctx.db.approval.iter()]) ctx.db.approval.id.delete(r.id);
  for (const r of [...ctx.db.policyDecision.iter()]) ctx.db.policyDecision.invoiceId.delete(r.invoiceId);
  for (const r of [...ctx.db.canary.iter()]) ctx.db.canary.invoiceId.delete(r.invoiceId);
  for (const r of [...ctx.db.invoice.iter()]) ctx.db.invoice.invoiceId.delete(r.invoiceId);
  for (const r of [...ctx.db.purchaseOrder.iter()]) ctx.db.purchaseOrder.poId.delete(r.poId);
  for (const r of [...ctx.db.contract.iter()]) ctx.db.contract.contractId.delete(r.contractId);
  for (const r of [...ctx.db.vendorChange.iter()]) ctx.db.vendorChange.id.delete(r.id);
  for (const r of [...ctx.db.vendor.iter()]) ctx.db.vendor.vendorId.delete(r.vendorId);
  for (const r of [...ctx.db.auditEvent.iter()]) ctx.db.auditEvent.id.delete(r.id);
  for (const r of [...ctx.db.answerKey.iter()]) ctx.db.answerKey.invoiceId.delete(r.invoiceId);
  for (const r of [...ctx.db.canaryStats.iter()]) ctx.db.canaryStats.id.delete(r.id);
  for (const r of [...ctx.db.autonomyState.iter()]) ctx.db.autonomyState.id.delete(r.id);
  for (const r of [...ctx.db.simClock.iter()]) ctx.db.simClock.id.delete(r.id);
}

/** Demo reset: wipes the books and loads the company as of the start of history. Admin only. */
export const seedCompany = spacetimedb.reducer({ json: t.string() }, (ctx, { json }) => {
  requireAdmin(ctx);
  const c = JSON.parse(json) as CompanyJson;
  wipe(ctx);
  for (const a of c.actors) {
    if (ctx.db.actor.actorId.find(a.id)) ctx.db.actor.actorId.update({ actorId: a.id, name: a.name, role: a.role });
    else ctx.db.actor.insert({ actorId: a.id, name: a.name, role: a.role });
  }
  for (const v of c.vendors) {
    ctx.db.vendor.insert({
      vendorId: v.id, name: v.name, category: v.category, expenseAccount: v.expense_account, bankLast4: v.bank_last4,
      bankChangedAt: v.bank_changed_at ?? '', heightenedUntil: v.heightened_until ?? '', firstSeenAt: v.first_seen_at, emailDomain: v.email_domain,
    });
  }
  for (const k of c.contracts) ctx.db.contract.insert({ contractId: k.id, vendorId: k.vendor_id, json: JSON.stringify(k) });
  for (const p of c.purchase_orders) {
    ctx.db.purchaseOrder.insert({ poId: p.id, vendorId: p.vendor_id, number: p.number, amountCents: p.amount_cents, description: p.description, status: p.status, createdAt: p.created_at });
  }
  ctx.db.simClock.insert({ id: 1, asOf: c.as_of, closedThrough: '', bankOutage: false, openingBalanceCents: c.opening_balance_cents });
  ctx.db.autonomyState.insert({ id: 1, cleanStreak: 0, rung: 0, ceilingCents: EARNED_AUTONOMY ? 0 : AUTO_PAY_MANDATE_CENTS, updatedAt: c.as_of });
  ctx.db.canaryStats.insert({ id: 1, presented: 0, caught: 0, missed: 0 });
  const open = openingEntry(c.opening_balance_cents, '2026-01-01T00:00:00.000Z');
  const row = ctx.db.journalEntry.insert({ id: 0n, invoiceId: '', memo: open.memo, postedAt: open.posted_at });
  for (const l of open.lines) ctx.db.journalLine.insert({ id: 0n, entryId: row.id, account: l.account, debitCents: l.debit_cents, creditCents: l.credit_cents });
});

export const setAnswerKey = spacetimedb.reducer({ json: t.string() }, (ctx, { json }) => {
  requireAdmin(ctx);
  for (const r of JSON.parse(json) as { invoice_id: string; error_type: string; expected_action: string }[]) {
    const row = { invoiceId: r.invoice_id, errorType: r.error_type, expectedAction: r.expected_action };
    if (ctx.db.answerKey.invoiceId.find(r.invoice_id)) ctx.db.answerKey.invoiceId.update(row);
    else ctx.db.answerKey.insert(row);
  }
});

/** Moves simulated time forward (never back: receipts must stay in time order), then chases stalls. */
export const setClock = spacetimedb.reducer({ asOf: t.string() }, (ctx, { asOf }) => {
  requireOperator(ctx);
  const c = clock(ctx);
  if (asOf < c.asOf) throw new SenderError('The clock only moves forward. Reset to replay from the start.');
  ctx.db.simClock.id.update({ ...c, asOf });
  sweepStalls(ctx);
});

export const setBankOutage = spacetimedb.reducer({ on: t.bool() }, (ctx, { on }) => {
  requireOperator(ctx);
  ctx.db.simClock.id.update({ ...clock(ctx), bankOutage: on });
  audit(ctx, 'operator', 'bank_outage', 'bank', true, on ? 'Simulated bank outage started.' : 'Simulated bank outage ended.');
});

/** An attention check, planted by the operator. It goes through the same pipeline; it can never pay. */
export const injectCanary = spacetimedb.reducer(ingestArgs, (ctx, a) => {
  requireOperator(ctx);
  ingest(ctx, a, true);
  audit(ctx, 'operator', 'canary_injected', a.invoiceId, true, 'A known-bad invoice was added to the approval queue as an attention check.');
});

// ------------------------------------------------------------------ public views over private tables

/** What the server should send to the bank: authorized or failed-and-retryable intents. */
export const payQueue = spacetimedb.anonymousView({ name: 'pay_queue', public: true }, t.array(paymentIntent.rowType), (ctx) =>
  [...ctx.db.paymentIntent.iter()].filter((p) => p.status === 'authorized' || p.status === 'failed')
);

const AccountBalance = t.object('AccountBalance', { account: t.string(), balanceCents: t.f64() });

export const ledgerBalances = spacetimedb.anonymousView({ name: 'ledger_balances', public: true }, t.array(AccountBalance), (ctx) => {
  const m = new Map<string, number>();
  for (const l of ctx.db.journalLine.iter()) m.set(l.account, (m.get(l.account) ?? 0) + l.debitCents - l.creditCents);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([account, balanceCents]) => ({ account, balanceCents }));
});

const JournalView = t.object('JournalView', {
  entryId: t.f64(),
  invoiceId: t.string(),
  memo: t.string(),
  postedAt: t.string(),
  account: t.string(),
  debitCents: t.f64(),
  creditCents: t.f64(),
});

export const journal = spacetimedb.anonymousView({ name: 'journal', public: true }, t.array(JournalView), (ctx) => {
  const entries = new Map([...ctx.db.journalEntry.iter()].map((e) => [e.id, e]));
  return [...ctx.db.journalLine.iter()].map((l) => {
    const e = entries.get(l.entryId);
    return {
      entryId: Number(l.entryId),
      invoiceId: e?.invoiceId ?? '',
      memo: e?.memo ?? '',
      postedAt: e?.postedAt ?? '',
      account: l.account,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
    };
  });
});

const Health = t.object('HealthCheck', {
  reconciled: t.bool(),
  ledgerCashCents: t.f64(),
  bankCashCents: t.f64(),
  differenceCents: t.f64(),
  entriesBalanced: t.bool(),
  unmatchedTransfers: t.u32(),
  chainOk: t.bool(),
  chainLength: t.u32(),
  chainBrokenAt: t.u32(),
  chainReason: t.string(),
});

/** Bank vs ledger reconciliation and receipt-chain verification, computed inside the database. */
export const health = spacetimedb.anonymousView({ name: 'health', public: true }, t.array(Health), (ctx) => {
  const c = ctx.db.simClock.id.find(1);
  if (!c) return [];
  const executed = [...ctx.db.bankTransfer.iter()].filter((x) => x.status === 'executed');
  const bank = c.openingBalanceCents - executed.reduce((a, x) => a + x.amountCents, 0);
  const perEntry = new Map<bigint, number>();
  let ledgerCash = 0;
  for (const l of ctx.db.journalLine.iter()) {
    perEntry.set(l.entryId, (perEntry.get(l.entryId) ?? 0) + l.debitCents - l.creditCents);
    if (l.account === ACCOUNTS.cash) ledgerCash += l.debitCents - l.creditCents;
  }
  const balanced = [...perEntry.values()].every((v) => v === 0);
  const paidIds = new Set([...ctx.db.journalEntry.iter()].filter((e) => e.memo.startsWith('Payment of')).map((e) => e.invoiceId));
  const unmatched = executed.filter((x) => !paidIds.has(x.invoiceId)).length;
  const receipts: Receipt[] = [...ctx.db.receipt.iter()].map((r) => ({
    id: String(r.seq),
    seq: r.seq,
    invoice_id: r.invoiceId,
    vendor_name: r.vendorName,
    amount_cents: r.amountCents,
    decision: r.decision as Receipt['decision'],
    tier: r.tier as Tier,
    rules: JSON.parse(r.rulesJson) as Pick<RuleResult, 'id' | 'reason' | 'tier'>[],
    claude_explanation: r.explanation,
    signal_confidence: r.signalConfidence < 0 ? null : r.signalConfidence,
    actor_ids: JSON.parse(r.actorIdsJson) as string[],
    as_of: r.asOf,
    note: r.note,
    prev_hash: r.prevHash,
    hash: r.hash,
  }));
  const chain = verifyChain(receipts);
  return [
    {
      reconciled: ledgerCash === bank && balanced && unmatched === 0,
      ledgerCashCents: ledgerCash,
      bankCashCents: bank,
      differenceCents: ledgerCash - bank,
      entriesBalanced: balanced,
      unmatchedTransfers: unmatched,
      chainOk: chain.ok,
      chainLength: chain.length,
      chainBrokenAt: chain.broken_at_seq ?? 0,
      chainReason: chain.reason ?? '',
    },
  ];
});

