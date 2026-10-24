import { SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from './schema';
import { evaluatePolicy, matchRate } from './core/engine';
import { mergeClaudeFlags } from './core/tiers';
import { checkSources } from './core/sources';
import { decideApproval, confirmWindowFor } from './core/protocol';
import { classify } from './core/classifier';
import { assertBalanced, paymentEntries } from './core/ledger';
import { applyAutonomyEvent, EARNED_AUTONOMY, LADDER } from './core/autonomy';
import { hashReceipt, GENESIS_HASH } from './core/chain';
import { addDays, daysBetween, formatCents } from './core/money';
import type {
  ClaudeCheck,
  Contract,
  ExtractedInvoice,
  Handoff,
  Invoice,
  PurchaseOrder,
  ReceiptBody,
  ReceiptDecision,
  RuleResult,
  Tier,
  Vendor,
} from './core/types';

export type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
type InvoiceRow = ReturnType<Ctx['db']['invoice']['invoiceId']['find']> & {};
type VendorRow = ReturnType<Ctx['db']['vendor']['vendorId']['find']> & {};

export const AGENT = 'act_agent';
export const PRIMARY_APPROVER = 'act_maya';
export const BACKUP_APPROVER = 'act_rosa';
export const NUDGE_AFTER_DAYS = 2;
export const ESCALATE_AFTER_DAYS = 4;
export const HEIGHTENED_DAYS = 120;

// ------------------------------------------------------------------ clock, identity, audit

export function clock(ctx: Ctx) {
  const c = ctx.db.simClock.id.find(1);
  if (!c) throw new SenderError('The company has not been seeded');
  return c;
}

export const now = (ctx: Ctx) => clock(ctx).asOf;

export function isAdmin(ctx: Ctx): boolean {
  return !!ctx.db.admin.identity.find(ctx.sender);
}

export function requireAdmin(ctx: Ctx): void {
  if (!isAdmin(ctx)) throw new SenderError('Refused: only the admin identity can do that');
}

/** The caller's actor, from its seat. Roles are never taken from arguments. */
export function caller(ctx: Ctx) {
  const s = ctx.db.seat.identity.find(ctx.sender);
  return s ? ctx.db.actor.actorId.find(s.actorId) ?? null : null;
}

export function requireRole(ctx: Ctx, role: string, action: string) {
  const a = caller(ctx);
  if (!a || a.role !== role) {
    throw new SenderError(`Refused: ${a ? `${a.name} (${a.role})` : 'an unseated identity'} cannot ${action}. Only the ${role} can.`);
  }
  return a;
}

export function audit(ctx: Ctx, actorId: string, action: string, target: string, allowed: boolean, detail: string) {
  ctx.db.auditEvent.insert({ id: 0n, at: now(ctx), actorId, action, target, allowed, detail });
}

// ------------------------------------------------------------------ row <-> core mapping

export function toVendor(v: VendorRow): Vendor {
  return {
    id: v.vendorId,
    name: v.name,
    category: v.category,
    expense_account: v.expenseAccount,
    bank_last4: v.bankLast4,
    bank_changed_at: v.bankChangedAt || null,
    heightened_until: v.heightenedUntil || null,
    first_seen_at: v.firstSeenAt,
    email_domain: v.emailDomain,
  };
}

function toPO(p: ReturnType<Ctx['db']['purchaseOrder']['poId']['find']> & {}): PurchaseOrder {
  return {
    id: p.poId,
    vendor_id: p.vendorId,
    number: p.number,
    amount_cents: p.amountCents,
    description: p.description,
    status: p.status as PurchaseOrder['status'],
    created_at: p.createdAt,
  };
}

const parse = <T>(s: string, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export const extractedOf = (inv: InvoiceRow) => parse<ExtractedInvoice>(inv.extractedJson, {} as ExtractedInvoice);

const SUFFIXES = /\b(the|inc|llc|co|corp|company|ltd|cooperative|coop)\b/g;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(SUFFIXES, ' ').replace(/\s+/g, ' ').trim();

/** By normalized name only. A look-alike email domain must never resolve to a vendor. */
function matchVendor(ctx: Ctx, name: string): VendorRow | null {
  const n = norm(name);
  if (!n) return null;
  const all = [...ctx.db.vendor.iter()];
  return (
    all.find((v) => norm(v.name) === n) ??
    all.find((v) => {
      const vn = norm(v.name);
      return vn.length > 4 && (n.includes(vn) || vn.includes(n));
    }) ??
    null
  );
}

// A bill still being checked is not committed spend, so it does not use up the PO.
const CONSUMING = new Set(['paid', 'awaiting_approval', 'awaiting_controller', 'payment_pending', 'paying']);

function poRemaining(ctx: Ctx, poId: string, amount: number, excludeId: string): number {
  let used = 0;
  for (const i of ctx.db.invoice.iter()) {
    if (i.poId === poId && i.invoiceId !== excludeId && CONSUMING.has(i.status) && !ctx.db.canary.invoiceId.find(i.invoiceId)) used += i.amountCents;
  }
  return amount - used;
}

function contractFor(ctx: Ctx, vendorId: string, at: string): Contract | null {
  const list = [...ctx.db.contract.vendorId.filter(vendorId)].map((c) => parse<Contract | null>(c.json, null)).filter((c): c is Contract => !!c);
  return list.filter((c) => c.effective_from <= at).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null;
}

function lastPaidLast4(ctx: Ctx, vendorId: string): string | null {
  const t = [...ctx.db.bankTransfer.iter()].filter((x) => x.vendorId === vendorId && x.status === 'executed').sort((a, b) => a.at.localeCompare(b.at));
  return t.length ? t[t.length - 1]!.toLast4 : null;
}

function postingPeriod(ctx: Ctx, invoiceDate: string): string {
  const own = invoiceDate.slice(0, 7);
  const closed = clock(ctx).closedThrough;
  if (!closed || own > closed) return own;
  const [y, m] = closed.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ ingest

export interface IngestArgs {
  invoiceId: string;
  extractedJson: string;
  rawText: string;
  sourceFormat: string;
  filePath: string;
  extractionMethod: string;
  handoffJson: string;
}

/**
 * The agent picks up a bill. Completes half-entered fields from the records, matches vendor, PO and
 * contract, checks every source against the system of record, and runs the policy engine. The tier
 * written here is the floor: the second review can only raise it.
 */
export function ingest(ctx: Ctx, a: IngestArgs, isCanary: boolean) {
  if (ctx.db.invoice.invoiceId.find(a.invoiceId)) throw new SenderError(`Invoice ${a.invoiceId} already exists`);
  const asOf = now(ctx);
  const x = parse<ExtractedInvoice | null>(a.extractedJson, null);
  if (!x || typeof x.amount_cents !== 'number' || x.amount_cents < 0 || !Number.isInteger(x.amount_cents)) {
    throw new SenderError('Extracted fields are missing or the amount is not whole cents');
  }
  const vRow = matchVendor(ctx, x.vendor_name ?? '');
  let poRow = vRow && x.po_number
    ? [...ctx.db.purchaseOrder.vendorId.filter(vRow.vendorId)].find((p) => p.number.toUpperCase() === x.po_number!.trim().toUpperCase() && p.status === 'open') ?? null
    : null;

  const contract = vRow ? contractFor(ctx, vRow.vendorId, asOf) : null;
  let handoff: Handoff | null = null;
  const h = parse<Omit<Handoff, 'filled'> | null>(a.handoffJson, null);
  if (h) {
    const filled: Handoff['filled'] = [];
    if (!poRow && vRow && h.missing.includes('po_number')) {
      const open = [...ctx.db.purchaseOrder.vendorId.filter(vRow.vendorId)].filter((p) => p.status === 'open');
      open.sort((p, q) => poRemaining(ctx, q.poId, q.amountCents, a.invoiceId) - poRemaining(ctx, p.poId, p.amountCents, a.invoiceId));
      if (open[0]) {
        poRow = open[0];
        x.po_number = open[0].number;
        filled.push({ field: 'PO', value: open[0].number, source: `${vRow.name}'s open purchase orders` });
      }
    }
    if (!x.due_date && h.missing.includes('due_date') && contract) {
      x.due_date = addDays(x.invoice_date ? `${x.invoice_date.slice(0, 10)}T00:00:00.000Z` : asOf, contract.payment_terms_days).slice(0, 10);
      filled.push({ field: 'Due date', value: x.due_date, source: `contract terms, net ${contract.payment_terms_days}` });
    }
    if (vRow && h.missing.includes('expense_account')) {
      filled.push({ field: 'Expense account', value: vRow.expenseAccount, source: 'vendor default coding' });
    }
    handoff = { ...h, filled };
  }

  const vendor = vRow ? toVendor(vRow) : null;
  const po = poRow ? toPO(poRow) : null;
  const remaining = poRow ? poRemaining(ctx, poRow.poId, poRow.amountCents, a.invoiceId) : null;
  const history: Pick<Invoice, 'id' | 'invoice_number' | 'amount_cents' | 'received_at' | 'status'>[] = vRow
    ? [...ctx.db.invoice.iter()]
        .filter((i) => i.vendorId === vRow.vendorId && !ctx.db.canary.invoiceId.find(i.invoiceId))
        .map((i) => ({ id: i.invoiceId, invoice_number: i.number, amount_cents: i.amountCents, received_at: i.receivedAt, status: i.status as Invoice['status'] }))
    : [];
  const dueIso = x.due_date ? `${x.due_date.slice(0, 10)}T00:00:00.000Z` : null;
  const auto = ctx.db.autonomyState.id.find(1)!;
  const policy = evaluatePolicy({
    invoice: { id: a.invoiceId, invoice_number: x.invoice_number || '(none)', amount_cents: x.amount_cents, due_date: dueIso, received_at: asOf, extracted: x },
    vendor,
    po,
    po_remaining_cents: remaining,
    contract,
    history,
    as_of: asOf,
    autonomy: { auto_pay_ceiling_cents: auto.ceilingCents, rung: auto.rung },
  });
  const sources = checkSources({
    extracted: x,
    amount_cents: x.amount_cents,
    received_at: asOf,
    vendor,
    po,
    po_remaining_cents: remaining,
    contract,
    last_paid_last4: vRow ? lastPaidLast4(ctx, vRow.vendorId) : null,
  });

  ctx.db.invoice.insert({
    invoiceId: a.invoiceId,
    vendorId: vRow?.vendorId ?? '',
    poId: poRow?.poId ?? '',
    number: x.invoice_number || '(none)',
    amountCents: x.amount_cents,
    dueDate: dueIso ?? '',
    receivedAt: asOf,
    sourceFormat: a.sourceFormat,
    filePath: a.filePath,
    rawText: a.rawText,
    extractedJson: JSON.stringify(x),
    extractionMethod: a.extractionMethod,
    status: 'reviewing',
    handoffJson: handoff ? JSON.stringify(handoff) : '',
    approvalRequestedAt: '',
    nudgedAt: '',
    assignedApprover: '',
    period: postingPeriod(ctx, x.invoice_date ? `${x.invoice_date.slice(0, 10)}T00:00:00.000Z` : asOf),
  });
  if (isCanary) ctx.db.canary.insert({ invoiceId: a.invoiceId });
  ctx.db.policyDecision.insert({
    invoiceId: a.invoiceId,
    sourcesJson: JSON.stringify(sources),
    rulesJson: JSON.stringify(policy.rules),
    ruleTier: policy.tier,
    claudeJson: '',
    finalTier: policy.tier,
    decidedAt: asOf,
    reviewed: false,
  });
  if (handoff?.filled.length) {
    audit(ctx, AGENT, 'handoff_completed', a.invoiceId, true,
      `Finished a bill from ${handoff.from}: ${handoff.filled.map((f) => `${f.field} = ${f.value} (from ${f.source})`).join('; ')}.`);
  }
}

/**
 * The second review lands. Flags can only raise the tier (mergeClaudeFlags). Then AUTO bills are
 * authorized for payment, everything else goes to a person.
 */
export function escalate(ctx: Ctx, invoiceId: string, claudeJson: string) {
  const inv = ctx.db.invoice.invoiceId.find(invoiceId);
  const d = ctx.db.policyDecision.invoiceId.find(invoiceId);
  if (!inv || !d) throw new SenderError('Invoice not found');
  if (inv.status !== 'reviewing') throw new SenderError(`Invoice is ${inv.status}, not waiting on review`);
  const review = parse<ClaudeCheck | null>(claudeJson, null);
  if (!review || !Array.isArray(review.flags)) throw new SenderError('Review must be JSON with a flags array');
  const final = mergeClaudeFlags(d.ruleTier as Tier, review.flags);
  ctx.db.policyDecision.invoiceId.update({ ...d, claudeJson, finalTier: final, reviewed: true });
  const isCanary = !!ctx.db.canary.invoiceId.find(invoiceId);
  if (final === 'AUTO' && !isCanary) {
    authorize(ctx, inv, -1, [AGENT], 'Paid automatically within the mandate.');
  } else {
    ctx.db.invoice.invoiceId.update({ ...inv, status: 'awaiting_approval', approvalRequestedAt: now(ctx), assignedApprover: PRIMARY_APPROVER });
    if (isCanary) {
      const s = ctx.db.canaryStats.id.find(1)!;
      ctx.db.canaryStats.id.update({ ...s, presented: s.presented + 1 });
    }
  }
}

// ------------------------------------------------------------------ payments (two phase)

/** Phase one. Always to the account on file, never the one printed on the invoice. Canaries never get here. */
function authorize(ctx: Ctx, inv: InvoiceRow, signal: number, actorIds: string[], note: string) {
  if (ctx.db.canary.invoiceId.find(inv.invoiceId)) throw new SenderError('Canary invoices never move money');
  const v = ctx.db.vendor.vendorId.find(inv.vendorId);
  if (!v) throw new SenderError('Cannot pay an invoice with no vendor on file');
  if (ctx.db.paymentIntent.invoiceId.find(inv.invoiceId)) throw new SenderError('A payment for this invoice already exists');
  ctx.db.paymentIntent.insert({
    invoiceId: inv.invoiceId,
    idempotencyKey: `nod-${inv.invoiceId}`,
    vendorId: v.vendorId,
    vendorName: v.name,
    amountCents: inv.amountCents,
    toLast4: v.bankLast4,
    status: 'authorized',
    attempts: 0,
    lastError: '',
    signalConfidence: signal,
    actorIdsJson: JSON.stringify(actorIds),
    note,
  });
  ctx.db.invoice.invoiceId.update({ ...inv, status: 'paying' });
}

/** Phase two, success: the bank confirmed. Post the balanced entries, mark paid, write the receipt. */
export function settle(ctx: Ctx, invoiceId: string, externalId: string, adapter: string) {
  const intent = ctx.db.paymentIntent.invoiceId.find(invoiceId);
  const inv = ctx.db.invoice.invoiceId.find(invoiceId);
  if (!intent || !inv) throw new SenderError('No payment intent for this invoice');
  if (intent.status === 'settled') return; // idempotent
  if (intent.status !== 'authorized' && intent.status !== 'failed') throw new SenderError(`Payment is ${intent.status}`);
  const v = ctx.db.vendor.vendorId.find(intent.vendorId)!;
  const asOf = now(ctx);
  if (clock(ctx).closedThrough && asOf.slice(0, 7) <= clock(ctx).closedThrough) throw new SenderError('Cannot post into a closed period');
  ctx.db.bankTransfer.insert({
    id: 0n, invoiceId, vendorId: v.vendorId, amountCents: intent.amountCents, toLast4: intent.toLast4,
    adapter, externalId, status: 'executed', error: '', at: asOf,
  });
  for (const e of paymentEntries({
    invoice_id: invoiceId, vendor_name: v.name, invoice_number: inv.number, expense_account: v.expenseAccount,
    amount_cents: intent.amountCents, posted_at: asOf,
  })) {
    assertBalanced(e.lines); // throws, and the whole transaction reverts, if debits != credits
    const row = ctx.db.journalEntry.insert({ id: 0n, invoiceId, memo: e.memo, postedAt: asOf });
    for (const l of e.lines) ctx.db.journalLine.insert({ id: 0n, entryId: row.id, account: l.account, debitCents: l.debit_cents, creditCents: l.credit_cents });
  }
  ctx.db.paymentIntent.invoiceId.update({ ...intent, status: 'settled', attempts: intent.attempts + 1 });
  ctx.db.invoice.invoiceId.update({ ...inv, status: 'paid' });
  const retried = intent.attempts > 0 ? ` Succeeded after ${intent.attempts} failed attempt(s); no duplicate payment.` : '';
  writeReceipt(ctx, inv, 'paid', intent.signalConfidence, JSON.parse(intent.actorIdsJson) as string[],
    `${intent.note} ${formatCents(intent.amountCents)} sent to the account on file ending ${intent.toLast4} via ${adapter} (${externalId}).${retried}`);
}

/** Phase two, failure: nothing posts, the intent stays for a retry with the same idempotency key. */
export function failPayment(ctx: Ctx, invoiceId: string, adapter: string, error: string) {
  const intent = ctx.db.paymentIntent.invoiceId.find(invoiceId);
  const inv = ctx.db.invoice.invoiceId.find(invoiceId);
  if (!intent || !inv) throw new SenderError('No payment intent for this invoice');
  if (intent.status === 'settled') throw new SenderError('Already settled');
  ctx.db.paymentIntent.invoiceId.update({ ...intent, status: 'failed', attempts: intent.attempts + 1, lastError: error });
  ctx.db.bankTransfer.insert({
    id: 0n, invoiceId, vendorId: intent.vendorId, amountCents: intent.amountCents, toLast4: intent.toLast4,
    adapter, externalId: '', status: 'failed', error, at: now(ctx),
  });
  ctx.db.invoice.invoiceId.update({ ...inv, status: 'payment_pending' });
  audit(ctx, AGENT, 'bank_failure', invoiceId, true, `${error}. Nothing posted to the ledger. The retry reuses idempotency key ${intent.idempotencyKey}.`);
}

// ------------------------------------------------------------------ receipts

function receiptRules(d: { rulesJson: string; claudeJson: string }) {
  const rules = parse<RuleResult[]>(d.rulesJson, []).filter((r) => r.fired).map((r) => ({ id: r.id, reason: r.reason, tier: r.tier }));
  const review = parse<ClaudeCheck | null>(d.claudeJson, null);
  return [...rules, ...(review?.flags ?? []).map((f) => ({ id: `review:${f.code}`, reason: f.reason, tier: f.severity as Tier }))];
}

/** Append-only and hash-chained. No reducer updates or deletes a receipt (except the admin demo reset). */
export function writeReceipt(ctx: Ctx, inv: InvoiceRow, decision: ReceiptDecision, signal: number, actorIds: string[], note: string) {
  let last: { seq: number; hash: string } | null = null;
  for (const r of ctx.db.receipt.iter()) if (!last || r.seq > last.seq) last = { seq: r.seq, hash: r.hash };
  const d = ctx.db.policyDecision.invoiceId.find(inv.invoiceId)!;
  const review = parse<ClaudeCheck | null>(d.claudeJson, null);
  const v = ctx.db.vendor.vendorId.find(inv.vendorId);
  const body: ReceiptBody = {
    seq: (last?.seq ?? 0) + 1,
    invoice_id: inv.invoiceId,
    vendor_name: v?.name ?? extractedOf(inv).vendor_name ?? 'unknown',
    amount_cents: inv.amountCents,
    decision,
    tier: d.finalTier as Tier,
    rules: receiptRules(d),
    claude_explanation: review ? `${review.explanation} Trusted source: ${review.trusted_source}. ${review.trust_reason}` : '',
    signal_confidence: signal < 0 ? null : signal,
    actor_ids: actorIds,
    as_of: now(ctx),
    note,
  };
  const prevHash = last?.hash ?? GENESIS_HASH;
  ctx.db.receipt.insert({
    seq: body.seq,
    invoiceId: body.invoice_id,
    vendorName: body.vendor_name,
    amountCents: body.amount_cents,
    decision: body.decision,
    tier: body.tier,
    rulesJson: JSON.stringify(body.rules),
    explanation: body.claude_explanation,
    signalConfidence: signal,
    actorIdsJson: JSON.stringify(body.actor_ids),
    asOf: body.as_of,
    note: body.note,
    prevHash,
    hash: hashReceipt(prevHash, body),
  });
}

// ------------------------------------------------------------------ approvals

function autonomyOnly(d: { finalTier: string; rulesJson: string; claudeJson: string }): boolean {
  const fired = parse<RuleResult[]>(d.rulesJson, []).filter((r) => r.fired);
  const flags = parse<ClaudeCheck | null>(d.claudeJson, null)?.flags ?? [];
  return d.finalTier === 'ASK' && fired.length === 1 && fired[0]!.id === 'autonomy' && flags.length === 0;
}

function bumpAutonomy(ctx: Ctx, event: 'clean_approval' | 'overturned') {
  if (!EARNED_AUTONOMY) return; // fixed mandate for the demo
  const a = ctx.db.autonomyState.id.find(1)!;
  const next = applyAutonomyEvent(
    { clean_streak: a.cleanStreak, rung: a.rung, auto_pay_ceiling_cents: a.ceilingCents, updated_at: a.updatedAt },
    event,
    now(ctx),
  );
  ctx.db.autonomyState.id.update({ id: 1, cleanStreak: next.clean_streak, rung: next.rung, ceilingCents: next.auto_pay_ceiling_cents, updatedAt: next.updated_at });
}

/**
 * One approval attempt. Confidence is computed here, inside the database, from the raw signal
 * window. The attempt number comes from the database's own count. The role comes from the seat.
 */
export function recordApproval(ctx: Ctx, invoiceId: string, samples: number[], latencyMs: number) {
  const who = requireRole(ctx, 'approver', 'approve a payment');
  const inv = ctx.db.invoice.invoiceId.find(invoiceId);
  if (!inv) throw new SenderError('Invoice not found');
  if (inv.status !== 'awaiting_approval') throw new SenderError(`Invoice is ${inv.status}, not awaiting approval`);
  const d = ctx.db.policyDecision.invoiceId.find(invoiceId)!;
  const attempt = [...ctx.db.approval.invoiceId.filter(invoiceId)].filter((x) => x.at >= inv.approvalRequestedAt).length + 1;
  const p = classify(samples);
  const outcome = decideApproval({ attempt, confidence: p, tier: d.finalTier as Tier });
  ctx.db.approval.insert({
    id: 0n, invoiceId, actorId: who.actorId, decision: outcome.decision, confidence: p ?? 0,
    windowMs: confirmWindowFor(attempt), attempt, latencyMs: Math.max(0, Math.round(latencyMs)), at: now(ctx),
  });
  const ids = [AGENT, who.actorId];
  const sig = p ?? 0;
  const isCanary = !!ctx.db.canary.invoiceId.find(invoiceId);
  const stats = ctx.db.canaryStats.id.find(1)!;

  if (outcome.next === 'pay' || outcome.next === 'controller') {
    if (isCanary) {
      ctx.db.invoice.invoiceId.update({ ...inv, status: 'canary_missed' });
      ctx.db.canaryStats.id.update({ ...stats, missed: stats.missed + 1 });
      writeReceipt(ctx, inv, 'canary_missed', sig, ids, 'Attention check: this was a planted known-bad invoice and it was approved. No money moved.');
    } else if (outcome.next === 'controller') {
      ctx.db.invoice.invoiceId.update({ ...inv, status: 'awaiting_controller' });
    } else {
      if (autonomyOnly(d)) bumpAutonomy(ctx, 'clean_approval');
      authorize(ctx, inv, sig, ids, outcome.reason);
    }
  } else if (outcome.next === 'stop') {
    if (isCanary) {
      ctx.db.invoice.invoiceId.update({ ...inv, status: 'canary_caught' });
      ctx.db.canaryStats.id.update({ ...stats, caught: stats.caught + 1 });
      writeReceipt(ctx, inv, 'canary_caught', sig, ids, 'Attention check passed: a planted known-bad invoice was refused.');
    } else {
      const explicitNo = p !== null && p < 0.5;
      if (explicitNo && autonomyOnly(d)) bumpAutonomy(ctx, 'overturned');
      ctx.db.invoice.invoiceId.update({ ...inv, status: explicitNo ? 'rejected' : 'held' });
      writeReceipt(ctx, inv, explicitNo ? 'rejected' : 'held', sig, ids,
        explicitNo ? `Approver said no. ${outcome.reason}` : `Default to no. ${outcome.reason} No money moved.`);
    }
  }
  return outcome;
}

/**
 * The controller's out-of-band callback on a HOLD the approver accepted. "confirmed" updates the
 * vendor record (the controller may; the agent may not) and authorizes payment. "mismatch" holds
 * and puts the vendor under stricter review for later invoices.
 */
export function controllerConfirm(ctx: Ctx, invoiceId: string, outcome: string, note: string) {
  const who = requireRole(ctx, 'controller', 'confirm a held payment');
  if (outcome !== 'confirmed' && outcome !== 'mismatch') throw new SenderError('Outcome must be confirmed or mismatch');
  const inv = ctx.db.invoice.invoiceId.find(invoiceId);
  if (!inv) throw new SenderError('Invoice not found');
  if (inv.status !== 'awaiting_controller') throw new SenderError(`Invoice is ${inv.status}, not awaiting the controller`);
  ctx.db.controllerCheck.insert({ id: 0n, invoiceId, actorId: who.actorId, outcome, note, at: now(ctx) });
  const accepted = [...ctx.db.approval.invoiceId.filter(invoiceId)].filter((a) => a.decision === 'accepted').pop();
  const ids = [AGENT, ...(accepted ? [accepted.actorId] : []), who.actorId];
  const v = ctx.db.vendor.vendorId.find(inv.vendorId);
  if (outcome === 'confirmed') {
    const newLast4 = extractedOf(inv).remit_bank_last4;
    if (v && newLast4 && newLast4 !== v.bankLast4) changeBank(ctx, who.actorId, v, newLast4, 'after a callback to the number on file');
    authorize(ctx, ctx.db.invoice.invoiceId.find(invoiceId)!, accepted?.confidence ?? -1, ids, `Controller confirmed by callback: ${note}`);
  } else {
    ctx.db.invoice.invoiceId.update({ ...inv, status: 'held' });
    if (v) ctx.db.vendor.vendorId.update({ ...v, heightenedUntil: addDays(now(ctx), HEIGHTENED_DAYS) });
    writeReceipt(ctx, inv, 'held', accepted?.confidence ?? -1, ids,
      `Controller said no: ${note} ${v ? `${v.name} is under stricter review for ${HEIGHTENED_DAYS} days.` : ''}`);
  }
}

export function changeBank(ctx: Ctx, actorId: string, v: VendorRow, last4: string, why: string) {
  if (!/^\d{4}$/.test(last4)) throw new SenderError('Account must end in four digits');
  ctx.db.vendorChange.insert({ id: 0n, vendorId: v.vendorId, actorId, field: 'bank_last4', oldValue: v.bankLast4, newValue: last4, at: now(ctx) });
  ctx.db.vendor.vendorId.update({ ...v, bankLast4: last4, bankChangedAt: now(ctx) });
  audit(ctx, actorId, 'vendor_change', v.vendorId, true, `Bank details for ${v.name} changed from ...${v.bankLast4} to ...${last4} ${why}.`);
}

// ------------------------------------------------------------------ time-driven work

/** Approvals stall. Nudge after two days; after four, hand the bill to the backup approver. */
export function sweepStalls(ctx: Ctx) {
  const t = now(ctx);
  const backup = ctx.db.actor.actorId.find(BACKUP_APPROVER);
  for (const inv of [...ctx.db.invoice.iter()]) {
    if (inv.status !== 'awaiting_approval' || !inv.approvalRequestedAt) continue;
    const waited = daysBetween(inv.approvalRequestedAt, t);
    let row = inv;
    if (waited >= NUDGE_AFTER_DAYS && !row.nudgedAt) {
      row = { ...row, nudgedAt: t };
      ctx.db.invoice.invoiceId.update(row);
      audit(ctx, AGENT, 'nudge', inv.invoiceId, true, `Reminder sent: ${inv.number} has waited ${Math.floor(waited)} days for approval.`);
    }
    if (waited >= ESCALATE_AFTER_DAYS && backup && row.assignedApprover !== backup.actorId) {
      ctx.db.invoice.invoiceId.update({ ...row, assignedApprover: backup.actorId });
      audit(ctx, AGENT, 'escalate', inv.invoiceId, true,
        `No answer in ${Math.floor(waited)} days. Handed ${inv.number} to the backup approver, ${backup.name}. Nothing was paid while it waited.`);
    }
  }
}

export function closePeriod(ctx: Ctx, period: string) {
  const who = requireRole(ctx, 'controller', 'close an accounting period');
  if (!/^\d{4}-\d{2}$/.test(period)) throw new SenderError('Period must be YYYY-MM');
  const c = clock(ctx);
  if (period >= c.asOf.slice(0, 7)) throw new SenderError('Only past months can be closed');
  if (c.closedThrough && period <= c.closedThrough) throw new SenderError(`${period} is already closed`);
  ctx.db.simClock.id.update({ ...c, closedThrough: period });
  audit(ctx, who.actorId, 'period_close', period, true,
    `${who.name} closed the books through ${period}. Late bills dated in a closed month post to the next open month.`);
}

export { LADDER, matchRate };
