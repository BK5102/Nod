import type { AutonomyState, Contract, Invoice, PurchaseOrder, RuleResult, Tier, Vendor } from "./types";
import { daysBetween, formatCents } from "./money";
import { maxTier } from "./tiers";

export interface PolicyConfig {
  hard_cap_cents: number;
  /** Materiality: how far over the PO or contract a bill can run before a person looks. */
  po_tolerance_pct: number;
  po_tolerance_min_cents: number;
  bank_change_window_days: number;
  duplicate_window_days: number;
  velocity_window_days: number;
  velocity_limit: number;
  new_vendor_days: number;
  rush_days: number;
}

export const DEFAULT_POLICY: PolicyConfig = {
  hard_cap_cents: 1_000_000, // $10,000
  po_tolerance_pct: 0.05,
  po_tolerance_min_cents: 2_500, // $25
  bank_change_window_days: 30,
  duplicate_window_days: 10,
  velocity_window_days: 7,
  velocity_limit: 3,
  new_vendor_days: 45,
  rush_days: 2,
};

/**
 * Strictness 0 is the loosest setting the eval sweeps, 1 the strictest. 0.5 is close to DEFAULT_POLICY.
 * Used only by the eval to draw the wrong-payments vs interruptions curve.
 */
export function policyAtStrictness(s: number): PolicyConfig {
  const t = Math.min(1, Math.max(0, s));
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    hard_cap_cents: Math.round(lerp(2_500_000, 500_000)),
    po_tolerance_pct: lerp(0.25, 0),
    po_tolerance_min_cents: Math.round(lerp(10_000, 0)),
    bank_change_window_days: Math.round(lerp(0, 60)),
    duplicate_window_days: Math.round(lerp(0, 20)),
    velocity_window_days: 7,
    velocity_limit: Math.round(lerp(8, 2)),
    new_vendor_days: Math.round(lerp(0, 90)),
    rush_days: Math.round(lerp(0, 4)),
  };
}

export interface PolicyInput {
  invoice: Pick<Invoice, "id" | "invoice_number" | "amount_cents" | "due_date" | "received_at" | "extracted">;
  vendor: Vendor | null;
  po: PurchaseOrder | null;
  /** PO amount less what has already been billed against it. Null when there is no PO. */
  po_remaining_cents: number | null;
  contract: Contract | null;
  /** Earlier invoices from the same vendor, any status except this one. */
  history: Pick<Invoice, "id" | "invoice_number" | "amount_cents" | "received_at" | "status">[];
  as_of: string;
  autonomy: Pick<AutonomyState, "auto_pay_ceiling_cents" | "rung">;
  config?: PolicyConfig;
}

export interface PolicyResult {
  tier: Tier;
  rules: RuleResult[];
}

type Rule = (i: PolicyInput, c: PolicyConfig) => RuleResult;

const fmtDate = (iso: string) => iso.slice(0, 10);

const knownVendor: Rule = ({ vendor, invoice, as_of }, c) => {
  if (!vendor) {
    return {
      id: "new_vendor",
      label: "Known vendor",
      fired: true,
      tier: "ASK",
      reason: `"${invoice.extracted.vendor_name}" is not on the vendor list.`,
    };
  }
  const age = daysBetween(vendor.first_seen_at, as_of);
  const fired = age < c.new_vendor_days;
  return {
    id: "new_vendor",
    label: "Known vendor",
    fired,
    tier: fired ? "ASK" : "AUTO",
    reason: fired
      ? `${vendor.name} was added ${Math.max(0, Math.floor(age))} days ago, under the ${c.new_vendor_days}-day new-vendor period.`
      : `${vendor.name} has been on file since ${fmtDate(vendor.first_seen_at)}.`,
  };
};

const hardCap: Rule = ({ invoice }, c) => {
  const fired = invoice.amount_cents > c.hard_cap_cents;
  return {
    id: "hard_cap",
    label: "Hard cap",
    fired,
    tier: fired ? "HOLD" : "AUTO",
    reason: fired
      ? `${formatCents(invoice.amount_cents)} is over the ${formatCents(c.hard_cap_cents)} hard cap.`
      : `Under the ${formatCents(c.hard_cap_cents)} hard cap.`,
  };
};

const poMatch: Rule = ({ invoice, po, po_remaining_cents }, c) => {
  if (!po) {
    return {
      id: "po_match",
      label: "Purchase order",
      fired: true,
      tier: "ASK",
      reason: invoice.extracted.po_number
        ? `PO ${invoice.extracted.po_number} on the invoice does not match an open purchase order.`
        : "No purchase order is referenced.",
    };
  }
  const remaining = po_remaining_cents ?? po.amount_cents;
  // Materiality is measured against this bill, not the whole blanket PO.
  const tolerance = Math.max(Math.round(invoice.amount_cents * c.po_tolerance_pct), c.po_tolerance_min_cents);
  const over = invoice.amount_cents - remaining;
  const fired = over > tolerance;
  return {
    id: "po_match",
    label: "Purchase order",
    fired,
    tier: fired ? "ASK" : "AUTO",
    reason: fired
      ? `${formatCents(over)} over what is left on PO ${po.number} (${formatCents(remaining)} of ${formatCents(po.amount_cents)}); materiality is ${formatCents(tolerance)}.`
      : `Within PO ${po.number}: ${formatCents(remaining)} left of ${formatCents(po.amount_cents)}.`,
  };
};

const bankChange: Rule = ({ invoice, vendor, as_of }, c) => {
  const remit = invoice.extracted.remit_bank_last4;
  if (vendor && remit && remit !== vendor.bank_last4) {
    return {
      id: "bank_change",
      label: "Bank details",
      fired: true,
      tier: "HOLD",
      reason: `Invoice asks for payment to account ending ${remit}; the account on file ends ${vendor.bank_last4}.`,
    };
  }
  if (vendor?.bank_changed_at) {
    const age = daysBetween(vendor.bank_changed_at, as_of);
    if (age >= 0 && age < c.bank_change_window_days) {
      return {
        id: "bank_change",
        label: "Bank details",
        fired: true,
        tier: "HOLD",
        reason: `Bank details for ${vendor.name} changed on ${fmtDate(vendor.bank_changed_at)}, ${Math.floor(age)} days ago.`,
      };
    }
  }
  return {
    id: "bank_change",
    label: "Bank details",
    fired: false,
    tier: "AUTO",
    reason: vendor ? `Paying the account on file ending ${vendor.bank_last4}.` : "No account on file to compare.",
  };
};

const duplicate: Rule = ({ invoice, history }, c) => {
  const live = history.filter((h) => h.id !== invoice.id && h.status !== "rejected");
  const sameNumber = live.find(
    (h) => h.invoice_number.trim().toLowerCase() === invoice.invoice_number.trim().toLowerCase(),
  );
  if (sameNumber) {
    return {
      id: "duplicate",
      label: "Duplicate",
      fired: true,
      tier: "HOLD",
      reason: `Invoice number ${invoice.invoice_number} was already received on ${fmtDate(sameNumber.received_at)}.`,
    };
  }
  const sameAmount = live.find(
    (h) =>
      h.amount_cents === invoice.amount_cents &&
      Math.abs(daysBetween(h.received_at, invoice.received_at)) <= c.duplicate_window_days,
  );
  if (sameAmount) {
    return {
      id: "duplicate",
      label: "Duplicate",
      fired: true,
      tier: "HOLD",
      reason: `Same amount as invoice ${sameAmount.invoice_number} from ${fmtDate(sameAmount.received_at)}, within ${c.duplicate_window_days} days.`,
    };
  }
  return { id: "duplicate", label: "Duplicate", fired: false, tier: "AUTO", reason: "No matching earlier invoice." };
};

const velocity: Rule = ({ invoice, history }, c) => {
  const recent = history.filter(
    (h) => h.id !== invoice.id && Math.abs(daysBetween(h.received_at, invoice.received_at)) <= c.velocity_window_days,
  );
  const fired = recent.length + 1 > c.velocity_limit;
  return {
    id: "velocity",
    label: "Velocity",
    fired,
    tier: fired ? "ASK" : "AUTO",
    reason: fired
      ? `${recent.length + 1} invoices from this vendor in ${c.velocity_window_days} days; the limit is ${c.velocity_limit}.`
      : `${recent.length + 1} invoice(s) from this vendor in ${c.velocity_window_days} days.`,
  };
};

const rush: Rule = ({ invoice }, c) => {
  if (!invoice.due_date) {
    return { id: "rush", label: "Timing", fired: false, tier: "AUTO", reason: "No due date given." };
  }
  const lead = daysBetween(invoice.received_at, invoice.due_date);
  const fired = lead < c.rush_days;
  return {
    id: "rush",
    label: "Timing",
    fired,
    tier: fired ? "ASK" : "AUTO",
    reason: fired
      ? `Due ${fmtDate(invoice.due_date)}, ${lead < 1 ? "less than a day" : lead < 2 ? "one day" : `${Math.floor(lead)} days`} after it arrived. Rush requests get a person.`
      : `Due ${fmtDate(invoice.due_date)}.`,
  };
};

const heightened: Rule = ({ vendor, as_of }) => {
  const until = vendor?.heightened_until;
  const fired = !!until && until > as_of;
  return {
    id: "heightened",
    label: "Vendor history",
    fired,
    tier: fired ? "ASK" : "AUTO",
    reason: fired
      ? `${vendor!.name} is under stricter review until ${fmtDate(until!)} after an earlier stop.`
      : "No recent stops on this vendor.",
  };
};

const autonomy: Rule = ({ invoice, autonomy }) => {
  const fired = invoice.amount_cents > autonomy.auto_pay_ceiling_cents;
  const limit = formatCents(autonomy.auto_pay_ceiling_cents);
  return {
    id: "autonomy",
    label: "Auto-pay limit",
    fired,
    tier: fired ? "ASK" : "AUTO",
    reason: fired
      ? autonomy.auto_pay_ceiling_cents === 0
        ? "Nod has no auto-pay limit yet. Every payment needs a person."
        : `${formatCents(invoice.amount_cents)} is over Nod's auto-pay limit of ${limit}.`
      : `Within Nod's auto-pay limit of ${limit}.`,
  };
};

const contractPrice: Rule = ({ invoice, contract }, c) => {
  const base = { id: "contract_price", label: "Contract price" };
  if (!contract) return { ...base, fired: false, tier: "AUTO", reason: "No contract on file to price against." };
  const slack = (cents: number) => Math.max(Math.round(cents * c.po_tolerance_pct), 100);
  if (contract.kind === "fixed_monthly" && contract.monthly_cents !== null) {
    const over = invoice.amount_cents - contract.monthly_cents;
    const fired = over > slack(contract.monthly_cents);
    return {
      ...base,
      fired,
      tier: fired ? "ASK" : "AUTO",
      reason: fired
        ? `Billed ${formatCents(invoice.amount_cents)}; the contract fee is ${formatCents(contract.monthly_cents)} a month.`
        : `Matches the ${formatCents(contract.monthly_cents)} monthly contract fee.`,
    };
  }
  const overpriced = invoice.extracted.line_items.flatMap((li) => {
    if (li.unit_price_cents === null) return [];
    const rate = matchRate(contract, li.description);
    if (!rate) return [];
    return li.unit_price_cents > rate.unit_cents + slack(rate.unit_cents)
      ? [`${li.description} at ${formatCents(li.unit_price_cents)} vs contract ${formatCents(rate.unit_cents)}`]
      : [];
  });
  const fired = overpriced.length > 0;
  return {
    ...base,
    fired,
    tier: fired ? "ASK" : "AUTO",
    reason: fired ? `Priced above contract: ${overpriced.join("; ")}.` : "Unit prices match the contract rate card.",
  };
};

/** Finds the contract rate whose item name shares the most words with a line item description. */
export function matchRate(contract: Contract, description: string) {
  const words = new Set(description.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  let best: { item: string; unit_cents: number } | null = null;
  let bestScore = 0;
  for (const r of contract.rates) {
    const score = r.item
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && words.has(w)).length;
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

const lineItems: Rule = ({ invoice }) => {
  const items = invoice.extracted.line_items;
  const base = { id: "line_items", label: "Line items" };
  if (items.length === 0) return { ...base, fired: false, tier: "AUTO", reason: "No line items to add up." };
  const sum = items.reduce((a, li) => a + li.amount_cents, 0);
  const diff = invoice.amount_cents - sum;
  const fired = Math.abs(diff) > 100;
  return {
    ...base,
    fired,
    tier: fired ? "ASK" : "AUTO",
    reason: fired
      ? `Line items add up to ${formatCents(sum)} but the total says ${formatCents(invoice.amount_cents)} (${formatCents(diff)} apart).`
      : `Line items add up to the total.`,
  };
};

const senderDomain: Rule = ({ invoice, vendor }) => {
  const base = { id: "sender_domain", label: "Sender" };
  const email = invoice.extracted.sender_email;
  if (!email || !vendor) return { ...base, fired: false, tier: "AUTO", reason: email ? "No vendor record to compare." : "Not an emailed invoice." };
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const fired = domain !== vendor.email_domain.toLowerCase();
  return {
    ...base,
    fired,
    tier: fired ? "HOLD" : "AUTO",
    reason: fired
      ? `Sent from ${domain}; ${vendor.name} sends from ${vendor.email_domain}.`
      : `Sent from ${vendor.name}'s usual domain.`,
  };
};

export const RULES: readonly Rule[] = [
  bankChange,
  duplicate,
  senderDomain,
  hardCap,
  knownVendor,
  poMatch,
  contractPrice,
  lineItems,
  velocity,
  rush,
  heightened,
  autonomy,
];

export function evaluatePolicy(input: PolicyInput): PolicyResult {
  const config = input.config ?? DEFAULT_POLICY;
  const rules = RULES.map((r) => r(input, config));
  const tier = maxTier(...rules.filter((r) => r.fired).map((r) => r.tier));
  return { tier, rules };
}
