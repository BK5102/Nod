import type {
  Approval,
  BankTransfer,
  ClaudeCheck,
  ControllerCheck,
  ExtractedInvoice,
  Handoff,
  Invoice,
  JournalEntry,
  PolicyDecision,
  ReceiptDecision,
  SourceFormat,
} from "@/lib/domain/types";
import { addDays, daysBetween, formatCents } from "@/lib/domain/money";
import { authorize } from "@/lib/auth/permissions";
import { decideApproval, confirmWindowFor } from "@/lib/approval/protocol";
import type { BankAdapter } from "@/lib/bank/adapter";
import type { CheckInput } from "@/lib/claude/check";
import { assertBalanced, paymentEntries } from "@/lib/ledger/ledger";
import { applyAutonomyEvent } from "@/lib/policy/autonomy";
import { evaluatePolicy, type PolicyConfig } from "@/lib/policy/engine";
import { mergeClaudeFlags } from "@/lib/policy/tiers";
import { checkSources } from "@/lib/sources/check";
import { newId } from "@/lib/store/world";
import type { Tx } from "@/lib/store/tx";
import {
  bestOpenPO,
  contractFor,
  lastPaidLast4,
  matchPO,
  matchVendor,
  poRemaining,
  postingPeriod,
  vendorHistory,
} from "./context";

export type Checker = (i: CheckInput) => Promise<ClaudeCheck>;

export const AGENT_ID = "act_agent";
export const NUDGE_AFTER_DAYS = 2;
export const ESCALATE_AFTER_DAYS = 4;
export const HEIGHTENED_DAYS = 120;

export class FlowError extends Error {
  constructor(
    message: string,
    public readonly status = 409,
  ) {
    super(message);
  }
}

export interface IngestInput {
  extracted: ExtractedInvoice;
  raw_text: string;
  source_format: SourceFormat;
  file_path?: string | null;
  extraction_method: Invoice["extraction_method"];
  is_canary?: boolean;
  handoff?: Omit<Handoff, "filled"> | null;
  id?: string;
}

/**
 * The agent picks up a bill: completes any half-done fields from the records, matches it, lets the
 * policy engine set the tier, lets the second reviewer escalate, then pays (AUTO) or queues it.
 */
export async function ingestInvoice(
  tx: Tx,
  input: IngestInput,
  deps: { checker: Checker; bank: BankAdapter; policy?: PolicyConfig },
): Promise<{ invoice: Invoice; decision: PolicyDecision }> {
  const w = tx.w;
  authorize(w.actors, AGENT_ID, "ingest_invoice", "invoice intake", w.sim_state.as_of);
  const extracted: ExtractedInvoice = structuredClone(input.extracted);
  const vendor = matchVendor(w, extracted);
  let po = matchPO(w, vendor, extracted.po_number);

  // Finish work a colleague handed over half done, and record where each filled value came from.
  let handoff: Handoff | null = null;
  if (input.handoff) {
    const filled: Handoff["filled"] = [];
    if (!po && vendor && input.handoff.missing.includes("po_number")) {
      const best = bestOpenPO(w, vendor);
      if (best) {
        po = best;
        extracted.po_number = best.number;
        filled.push({ field: "PO", value: best.number, source: `${vendor.name}'s open purchase orders` });
      }
    }
    if (!extracted.due_date && input.handoff.missing.includes("due_date")) {
      const c = contractFor(w, vendor, w.sim_state.as_of);
      if (c) {
        const due = addDays(extracted.invoice_date ?? w.sim_state.as_of, c.payment_terms_days).slice(0, 10);
        extracted.due_date = due;
        filled.push({ field: "Due date", value: due, source: `contract terms, net ${c.payment_terms_days}` });
      }
    }
    if (vendor && input.handoff.missing.includes("expense_account")) {
      filled.push({ field: "Expense account", value: vendor.expense_account, source: "vendor default coding" });
    }
    handoff = { ...input.handoff, filled };
  }

  const received_at = w.sim_state.as_of;
  const invoiceDate = extracted.invoice_date ? new Date(extracted.invoice_date).toISOString() : received_at;
  const { period } = postingPeriod(w, invoiceDate);
  const invoice: Invoice = {
    id: input.id ?? newId("inv"),
    vendor_id: vendor?.id ?? null,
    po_id: po?.id ?? null,
    invoice_number: extracted.invoice_number || "(none)",
    amount_cents: extracted.amount_cents,
    due_date: extracted.due_date ? new Date(extracted.due_date).toISOString() : null,
    received_at,
    source_format: input.source_format,
    file_path: input.file_path ?? null,
    raw_text: input.raw_text,
    extracted,
    extraction_method: input.extraction_method,
    status: "received",
    is_canary: !!input.is_canary,
    handoff,
    approval_requested_at: null,
    nudged_at: null,
    assigned_approver_id: null,
    period,
  };

  const history = vendorHistory(w, vendor);
  const contract = contractFor(w, vendor, received_at);
  const po_remaining_cents = po ? poRemaining(w, po) : null;
  const sources = checkSources({
    extracted,
    amount_cents: invoice.amount_cents,
    received_at,
    vendor,
    po,
    po_remaining_cents,
    contract,
    last_paid_last4: lastPaidLast4(w, vendor),
  });
  const policy = evaluatePolicy({
    invoice,
    vendor,
    po,
    po_remaining_cents,
    contract,
    history,
    as_of: received_at,
    autonomy: w.autonomy_state,
    config: deps.policy,
  });
  const claude = await deps.checker({
    invoice,
    vendor,
    po,
    contract,
    recent: history.slice(-6),
    rules: policy.rules,
    sources,
  });
  const final_tier = mergeClaudeFlags(policy.tier, claude.flags);

  tx.insert("invoices", invoice);
  if (handoff?.filled.length) {
    tx.audit({
      actor_id: AGENT_ID,
      action: "handoff_completed",
      target: invoice.id,
      allowed: true,
      detail: `Finished a bill from ${handoff.from}: ${handoff.filled.map((f) => `${f.field} = ${f.value} (from ${f.source})`).join("; ")}.`,
    });
  }
  const decision = tx.insert<PolicyDecision>("policy_decisions", {
    id: newId("dec"),
    invoice_id: invoice.id,
    sources,
    rules_fired: policy.rules,
    rule_tier: policy.tier,
    claude,
    final_tier,
    decided_at: received_at,
  });

  if (final_tier === "AUTO" && !invoice.is_canary) {
    authorize(w.actors, AGENT_ID, "pay_within_mandate", invoice.id, received_at);
    await payInvoice(tx, invoice.id, { bank: deps.bank, signal_confidence: null, actor_ids: [AGENT_ID], note: "Paid automatically within the mandate." });
  } else {
    authorize(w.actors, AGENT_ID, "request_payment", invoice.id, received_at);
    const approver = w.actors.find((a) => a.role === "approver");
    tx.update("invoices", invoice.id, {
      status: "awaiting_approval",
      approval_requested_at: received_at,
      assigned_approver_id: approver?.id ?? null,
    });
  }
  return { invoice: tx.w.invoices.find((i) => i.id === invoice.id)!, decision };
}

function decisionFor(tx: Tx, invoiceId: string): PolicyDecision {
  const d = [...tx.w.policy_decisions].reverse().find((x) => x.invoice_id === invoiceId);
  if (!d) throw new FlowError(`No policy decision for ${invoiceId}`);
  return d;
}

function receiptRules(d: PolicyDecision) {
  return [
    ...d.rules_fired.filter((r) => r.fired).map((r) => ({ id: r.id, reason: r.reason, tier: r.tier })),
    ...d.claude.flags.map((f) => ({ id: `review:${f.code}`, reason: f.reason, tier: f.severity })),
  ];
}

function writeReceipt(
  tx: Tx,
  inv: Invoice,
  decision: ReceiptDecision,
  extra: { signal_confidence: number | null; actor_ids: string[]; note: string },
) {
  const d = decisionFor(tx, inv.id);
  const vendor = tx.w.vendors.find((v) => v.id === inv.vendor_id);
  return tx.receipt({
    invoice_id: inv.id,
    vendor_name: vendor?.name ?? inv.extracted.vendor_name,
    amount_cents: inv.amount_cents,
    decision,
    tier: d.final_tier,
    rules: receiptRules(d),
    claude_explanation: `${d.claude.explanation} Trusted source: ${d.claude.trusted_source}. ${d.claude.trust_reason}`,
    signal_confidence: extra.signal_confidence,
    actor_ids: extra.actor_ids,
    note: extra.note,
  });
}

/**
 * Moves money. Idempotent per invoice: a second call after success is a no-op, and the bank sees
 * the same idempotency key on every retry. The ledger posts only after the bank confirms.
 * Canary invoices never reach the bank.
 */
export async function payInvoice(
  tx: Tx,
  invoiceId: string,
  ctx: { bank: BankAdapter; signal_confidence: number | null; actor_ids: string[]; note: string },
): Promise<"paid" | "pending" | "already_paid"> {
  const w = tx.w;
  const inv = w.invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new FlowError("Invoice not found", 404);
  if (inv.is_canary) throw new FlowError("Canary invoices never move money");
  if (w.bank_transfers.some((t) => t.invoice_id === inv.id && t.status === "executed")) return "already_paid";
  const vendor = w.vendors.find((v) => v.id === inv.vendor_id);
  if (!vendor) throw new FlowError("Cannot pay an invoice with no vendor on file");

  const result = await ctx.bank.pay({
    idempotency_key: `nod-${inv.id}`,
    amount_cents: inv.amount_cents,
    // Always the account on file. Never the account printed on the invoice.
    to: { name: vendor.name, last4: vendor.bank_last4 },
    memo: `Eastbay Community Pantry ${inv.invoice_number}`,
  });

  if (!result.ok) {
    tx.insert<BankTransfer>("bank_transfers", {
      id: newId("trf"),
      invoice_id: inv.id,
      vendor_id: vendor.id,
      amount_cents: inv.amount_cents,
      to_last4: vendor.bank_last4,
      adapter: result.adapter,
      external_id: null,
      status: "failed",
      error: result.error,
      created_at: w.sim_state.as_of,
    });
    tx.update("invoices", inv.id, { status: "payment_pending" });
    tx.audit({
      actor_id: AGENT_ID,
      action: "bank_failure",
      target: inv.id,
      allowed: true,
      detail: `${result.error}. Nothing posted to the ledger. Invoice kept in the pay queue; the retry reuses the same idempotency key.`,
    });
    return "pending";
  }

  tx.insert<BankTransfer>("bank_transfers", {
    id: newId("trf"),
    invoice_id: inv.id,
    vendor_id: vendor.id,
    amount_cents: inv.amount_cents,
    to_last4: vendor.bank_last4,
    adapter: result.adapter,
    external_id: result.external_id,
    status: "executed",
    error: null,
    created_at: w.sim_state.as_of,
  });
  for (const e of paymentEntries({
    invoice_id: inv.id,
    vendor_name: vendor.name,
    invoice_number: inv.invoice_number,
    expense_account: vendor.expense_account,
    amount_cents: inv.amount_cents,
    posted_at: w.sim_state.as_of,
  })) {
    assertBalanced(e.lines);
    tx.insert<JournalEntry>("journal_entries", { id: newId("je"), ...e });
  }
  tx.update("invoices", inv.id, { status: "paid" });
  const prior = w.bank_transfers.filter((t) => t.invoice_id === inv.id && t.status === "failed").length;
  writeReceipt(tx, { ...inv, status: "paid" }, "paid", {
    signal_confidence: ctx.signal_confidence,
    actor_ids: ctx.actor_ids,
    note: `${ctx.note} ${formatCents(inv.amount_cents)} sent to the account on file ending ${vendor.bank_last4} via ${result.adapter} (${result.external_id}).${prior ? ` Succeeded after ${prior} failed attempt(s); no duplicate payment.` : ""}`,
  });
  return "paid";
}

/** Retry for bills stuck in payment_pending after a bank failure. */
export async function retryPayment(tx: Tx, invoiceId: string, bank: BankAdapter) {
  const inv = tx.w.invoices.find((i) => i.id === invoiceId);
  if (!inv || inv.status !== "payment_pending") throw new FlowError("Invoice is not waiting on a payment retry");
  authorize(tx.w.actors, AGENT_ID, "request_payment", invoiceId, tx.w.sim_state.as_of);
  tx.audit({ actor_id: AGENT_ID, action: "bank_retry", target: inv.id, allowed: true, detail: "Retrying payment with the same idempotency key." });
  const lastApproval = [...tx.w.approvals].reverse().find((a) => a.invoice_id === inv.id && a.decision === "accepted");
  return payInvoice(tx, invoiceId, {
    bank,
    signal_confidence: lastApproval?.signal_confidence ?? null,
    actor_ids: lastApproval ? [AGENT_ID, lastApproval.actor_id] : [AGENT_ID],
    note: "Paid on retry after a bank failure.",
  });
}

/** True when the only reason a person was asked is that autonomy has not been earned yet. */
function autonomyOnly(d: PolicyDecision): boolean {
  const fired = d.rules_fired.filter((r) => r.fired);
  return d.final_tier === "ASK" && fired.length === 1 && fired[0]!.id === "autonomy" && d.claude.flags.length === 0;
}

export interface ApprovalResult {
  approval: Approval;
  outcome: ReturnType<typeof decideApproval>;
  invoice_status: Invoice["status"];
}

/**
 * Records one approval attempt. The confidence comes from the server-side classifier, the
 * attempt number from the server's own count, and the actor's role from the actor record.
 */
export async function recordApproval(
  tx: Tx,
  args: { invoice_id: string; actor_id: string; confidence: number | null; latency_ms: number; bank: BankAdapter },
): Promise<ApprovalResult> {
  const w = tx.w;
  const actor = authorize(w.actors, args.actor_id, "approve_payment", args.invoice_id, w.sim_state.as_of);
  const inv = w.invoices.find((i) => i.id === args.invoice_id);
  if (!inv) throw new FlowError("Invoice not found", 404);
  if (inv.status !== "awaiting_approval") throw new FlowError(`Invoice is ${inv.status}, not awaiting approval`);
  const d = decisionFor(tx, inv.id);
  const prior = w.approvals.filter((a) => a.invoice_id === inv.id && a.created_at >= (inv.approval_requested_at ?? ""));
  const attempt = prior.length + 1;
  const outcome = decideApproval({ attempt, confidence: args.confidence, tier: d.final_tier });
  const approval = tx.insert<Approval>("approvals", {
    id: newId("apv"),
    invoice_id: inv.id,
    actor_id: actor.id,
    actor_role: actor.role,
    decision: outcome.decision,
    signal_confidence: args.confidence ?? 0,
    confirm_window_ms: confirmWindowFor(attempt),
    attempts: attempt,
    latency_ms: Math.max(0, Math.round(args.latency_ms)),
    created_at: w.sim_state.as_of,
  });
  const p = args.confidence;
  const ids = [AGENT_ID, actor.id];

  if (outcome.next === "pay" || outcome.next === "controller") {
    if (inv.is_canary) {
      tx.update("invoices", inv.id, { status: "canary_missed" });
      writeReceipt(tx, inv, "canary_missed", {
        signal_confidence: p,
        actor_ids: ids,
        note: "Attention check: this was a planted known-bad invoice and it was approved. No money moved.",
      });
    } else if (outcome.next === "controller") {
      tx.update("invoices", inv.id, { status: "awaiting_controller" });
    } else {
      if (autonomyOnly(d)) tx.setAutonomy(applyAutonomyEvent(w.autonomy_state, "clean_approval", w.sim_state.as_of));
      await payInvoice(tx, inv.id, { bank: args.bank, signal_confidence: p, actor_ids: ids, note: outcome.reason });
    }
  } else if (outcome.next === "stop") {
    if (inv.is_canary) {
      tx.update("invoices", inv.id, { status: "canary_caught" });
      writeReceipt(tx, inv, "canary_caught", { signal_confidence: p, actor_ids: ids, note: "Attention check passed: a planted known-bad invoice was refused." });
    } else {
      const explicitNo = p !== null && p < 0.5;
      if (explicitNo && autonomyOnly(d)) tx.setAutonomy(applyAutonomyEvent(w.autonomy_state, "overturned", w.sim_state.as_of));
      tx.update("invoices", inv.id, { status: explicitNo ? "rejected" : "held" });
      writeReceipt(tx, inv, explicitNo ? "rejected" : "held", {
        signal_confidence: p,
        actor_ids: ids,
        note: explicitNo ? `Approver said no. ${outcome.reason}` : `Default to no. ${outcome.reason} No money moved.`,
      });
    }
  }
  const after = tx.w.invoices.find((i) => i.id === inv.id)!;
  return { approval, outcome, invoice_status: after.status };
}

/**
 * The controller's out-of-band check on a HOLD that the approver accepted. "confirmed" updates the
 * vendor record (the controller may; the agent may not) and pays. "mismatch" holds and puts the
 * vendor under stricter review, which later invoices from that vendor will feel.
 */
export async function controllerDecision(
  tx: Tx,
  args: { invoice_id: string; actor_id: string; outcome: "confirmed" | "mismatch"; note: string; bank: BankAdapter },
): Promise<ControllerCheck> {
  const w = tx.w;
  const actor = authorize(w.actors, args.actor_id, "controller_callback", args.invoice_id, w.sim_state.as_of);
  const inv = w.invoices.find((i) => i.id === args.invoice_id);
  if (!inv) throw new FlowError("Invoice not found", 404);
  if (inv.status !== "awaiting_controller") throw new FlowError(`Invoice is ${inv.status}, not awaiting the controller`);
  const check = tx.insert<ControllerCheck>("controller_checks", {
    id: newId("ctl"),
    invoice_id: inv.id,
    actor_id: actor.id,
    outcome: args.outcome,
    note: args.note,
    created_at: w.sim_state.as_of,
  });
  const vendor = w.vendors.find((v) => v.id === inv.vendor_id);
  const approval = [...w.approvals].reverse().find((a) => a.invoice_id === inv.id && a.decision === "accepted");
  const ids = [AGENT_ID, ...(approval ? [approval.actor_id] : []), actor.id];
  if (args.outcome === "confirmed") {
    const newLast4 = inv.extracted.remit_bank_last4;
    if (vendor && newLast4 && newLast4 !== vendor.bank_last4) {
      authorize(w.actors, actor.id, "edit_vendor_bank", vendor.id, w.sim_state.as_of);
      tx.insert("vendor_changes", {
        id: newId("vch"),
        vendor_id: vendor.id,
        actor_id: actor.id,
        field: "bank_last4",
        old_value: vendor.bank_last4,
        new_value: newLast4,
        created_at: w.sim_state.as_of,
      });
      tx.update("vendors", vendor.id, { bank_last4: newLast4, bank_changed_at: w.sim_state.as_of });
      tx.audit({
        actor_id: actor.id,
        action: "vendor_change",
        target: vendor.id,
        allowed: true,
        detail: `Bank details for ${vendor.name} changed from ...${vendor.bank_last4} to ...${newLast4} after a callback.`,
      });
    }
    await payInvoice(tx, inv.id, {
      bank: args.bank,
      signal_confidence: approval?.signal_confidence ?? null,
      actor_ids: ids,
      note: `Controller confirmed by callback: ${args.note}`,
    });
  } else {
    tx.update("invoices", inv.id, { status: "held" });
    if (vendor) tx.update("vendors", vendor.id, { heightened_until: addDays(w.sim_state.as_of, HEIGHTENED_DAYS) });
    writeReceipt(tx, inv, "held", {
      signal_confidence: approval?.signal_confidence ?? null,
      actor_ids: ids,
      note: `Controller said no: ${args.note} ${vendor ? `${vendor.name} is under stricter review for ${HEIGHTENED_DAYS} days.` : ""}`,
    });
  }
  return check;
}

/** Approvals do stall. Nudge after two days, then hand to the backup approver after four. */
export function sweepStalls(tx: Tx): void {
  const w = tx.w;
  const now = w.sim_state.as_of;
  const backup = w.actors.find((a) => a.role === "approver" && a.id !== w.actors.find((x) => x.role === "approver")?.id);
  for (const inv of w.invoices) {
    if (inv.status !== "awaiting_approval" || !inv.approval_requested_at) continue;
    const waited = daysBetween(inv.approval_requested_at, now);
    if (waited >= NUDGE_AFTER_DAYS && !inv.nudged_at) {
      tx.update("invoices", inv.id, { nudged_at: now });
      tx.audit({
        actor_id: AGENT_ID,
        action: "nudge",
        target: inv.id,
        allowed: true,
        detail: `Reminder sent: ${inv.invoice_number} has waited ${Math.floor(waited)} days for approval.`,
      });
    }
    if (waited >= ESCALATE_AFTER_DAYS && backup && inv.assigned_approver_id !== backup.id) {
      tx.update("invoices", inv.id, { assigned_approver_id: backup.id });
      tx.audit({
        actor_id: AGENT_ID,
        action: "escalate",
        target: inv.id,
        allowed: true,
        detail: `No answer in ${Math.floor(waited)} days. Handed ${inv.invoice_number} to the backup approver, ${backup.name}. Nothing was paid while it waited.`,
      });
    }
  }
}

/** Locks every period up to and including `period` (YYYY-MM). Controller only. */
export function closePeriod(tx: Tx, args: { actor_id: string; period: string }): void {
  const w = tx.w;
  const actor = authorize(w.actors, args.actor_id, "close_period", args.period, w.sim_state.as_of);
  if (!/^\d{4}-\d{2}$/.test(args.period)) throw new FlowError("Period must be YYYY-MM", 400);
  if (args.period >= w.sim_state.as_of.slice(0, 7)) throw new FlowError("Only past months can be closed", 400);
  if (w.sim_state.closed_through && args.period <= w.sim_state.closed_through) throw new FlowError(`${args.period} is already closed`);
  tx.setSim({ ...w.sim_state, closed_through: args.period });
  tx.audit({
    actor_id: actor.id,
    action: "period_close",
    target: args.period,
    allowed: true,
    detail: `${actor.name} closed the books through ${args.period}. Late bills dated in a closed month post to the next open month.`,
  });
}
