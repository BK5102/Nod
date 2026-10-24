// Core domain types. Mirrors supabase/migrations/0001_schema.sql.

export type Role = "agent" | "approver" | "controller" | "auditor" | "operator";
export type Tier = "AUTO" | "ASK" | "HOLD";
export type SourceFormat = "pdf" | "email" | "image" | "text";

export type InvoiceStatus =
  | "received" // extracted, not yet tiered
  | "awaiting_approval" // ASK or HOLD, waiting on the approver
  | "awaiting_controller" // HOLD, approver said yes, controller callback pending
  | "payment_pending" // cleared to pay, bank call failed; retried without paying twice
  | "paid"
  | "held" // stopped: default-to-no outcome, or controller found a mismatch
  | "rejected" // approver said no
  | "canary_caught" // known-bad canary rejected by the approver
  | "canary_missed"; // known-bad canary approved by the approver; never pays

export interface Actor {
  id: string;
  name: string;
  role: Role;
}

export interface Vendor {
  id: string;
  name: string;
  category: string;
  expense_account: string;
  bank_last4: string;
  bank_changed_at: string | null;
  heightened_until: string | null;
  first_seen_at: string;
  email_domain: string;
}

export interface PurchaseOrder {
  id: string;
  vendor_id: string;
  number: string;
  amount_cents: number;
  description: string;
  status: "open" | "closed";
  created_at: string;
}

/** Fields pulled out of an invoice document. Everything here is untrusted. */
export interface ExtractedInvoice {
  vendor_name: string;
  invoice_number: string;
  amount_cents: number;
  currency: string;
  invoice_date: string | null;
  due_date: string | null;
  po_number: string | null;
  remit_bank_last4: string | null;
  line_items: { description: string; quantity: number | null; unit_price_cents: number | null; amount_cents: number }[];
  notes: string | null;
  /** Sender address for emailed invoices. Used to spot look-alike domains. */
  sender_email: string | null;
}

/** Vendor contract: the system of record for price and payment terms. */
export interface Contract {
  id: string;
  vendor_id: string;
  kind: "unit_rates" | "fixed_monthly" | "hourly";
  monthly_cents: number | null;
  rates: { item: string; unit_cents: number }[];
  payment_terms_days: number;
  scope: string;
  effective_from: string;
}

/** A bill another person or system started and did not finish. */
export interface Handoff {
  from: string;
  note: string;
  missing: string[];
  filled: { field: string; value: string; source: string }[];
}

export interface Invoice {
  id: string;
  vendor_id: string | null;
  po_id: string | null;
  invoice_number: string;
  amount_cents: number;
  due_date: string | null;
  received_at: string;
  source_format: SourceFormat;
  file_path: string | null;
  raw_text: string;
  extracted: ExtractedInvoice;
  extraction_method: "claude" | "parser" | "seed";
  status: InvoiceStatus;
  is_canary: boolean;
  handoff: Handoff | null;
  /** Set when the invoice enters the approval queue. */
  approval_requested_at: string | null;
  nudged_at: string | null;
  /** Approver currently responsible. Changes when a stalled approval escalates. */
  assigned_approver_id: string | null;
  /** Accounting period the bill posts to (YYYY-MM). Later than the invoice date if that period is closed. */
  period: string | null;
}

export interface RuleResult {
  id: string;
  label: string;
  fired: boolean;
  tier: Tier;
  reason: string;
}

export interface ClaudeFlag {
  code: string;
  /** Flags can only escalate, so AUTO is not a legal severity. */
  severity: "ASK" | "HOLD";
  reason: string;
}

export interface ClaudeCheck {
  trusted_source: "invoice" | "purchase_order" | "vendor_record" | "none";
  trust_reason: string;
  flags: ClaudeFlag[];
  explanation: string;
  method: "claude" | "heuristic";
}

export interface PolicyDecision {
  id: string;
  invoice_id: string;
  sources: SourceRow[];
  rules_fired: RuleResult[];
  rule_tier: Tier;
  claude: ClaudeCheck;
  final_tier: Tier;
  decided_at: string;
}

export type ApprovalDecision = "accepted" | "reconfirm" | "denied";

export interface Approval {
  id: string;
  invoice_id: string;
  actor_id: string;
  actor_role: Role;
  decision: ApprovalDecision;
  signal_confidence: number;
  confirm_window_ms: number;
  attempts: number;
  latency_ms: number;
  created_at: string;
}

export interface ControllerCheck {
  id: string;
  invoice_id: string;
  actor_id: string;
  outcome: "confirmed" | "mismatch";
  note: string;
  created_at: string;
}

export interface JournalLine {
  account: string;
  debit_cents: number;
  credit_cents: number;
}

export interface JournalEntry {
  id: string;
  invoice_id: string | null;
  memo: string;
  posted_at: string;
  lines: JournalLine[];
}

export interface BankTransfer {
  id: string;
  invoice_id: string;
  vendor_id: string;
  amount_cents: number;
  to_last4: string;
  adapter: string;
  external_id: string | null;
  status: "executed" | "failed";
  error: string | null;
  created_at: string;
}

export type ReceiptDecision = "paid" | "held" | "rejected" | "canary_caught" | "canary_missed" | "queued";

export interface ReceiptBody {
  seq: number;
  invoice_id: string;
  vendor_name: string;
  amount_cents: number;
  decision: ReceiptDecision;
  tier: Tier;
  rules: { id: string; reason: string; tier: Tier }[];
  claude_explanation: string;
  signal_confidence: number | null;
  actor_ids: string[];
  as_of: string;
  note: string;
}

export interface Receipt extends ReceiptBody {
  id: string;
  prev_hash: string;
  hash: string;
}

export interface AutonomyState {
  clean_streak: number;
  rung: number;
  auto_pay_ceiling_cents: number;
  updated_at: string;
}

export interface SimState {
  as_of: string;
  opening_balance_cents: number;
  /** Last closed period, YYYY-MM. Entries dated in or before it are locked. */
  closed_through: string | null;
  bank_outage: boolean;
}

export type AuditAction =
  | "denied"
  | "nudge"
  | "escalate"
  | "period_close"
  | "bank_failure"
  | "bank_retry"
  | "vendor_change"
  | "handoff_completed"
  | "canary_injected"
  | "clock";

/** Append-only audit trail of who did what, when and why, including attempts that were refused. */
export interface AuditEvent {
  id: string;
  at: string;
  actor_id: string;
  action: AuditAction;
  target: string;
  allowed: boolean;
  detail: string;
}

/** One row of the source check: what each source says about a field and which one Nod trusts. */
export interface SourceRow {
  field: string;
  values: { source: SourceName; value: string }[];
  agree: boolean;
  system_of_record: SourceName;
  trusted_value: string;
  why: string;
}

export type SourceName = "invoice" | "purchase_order" | "contract" | "vendor_master" | "bank_history" | "ledger";

export interface AnswerKeyRow {
  invoice_id: string;
  error_type: string;
  expected_action: "pay" | "stop";
}
