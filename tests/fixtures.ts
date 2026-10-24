import type { Contract, ExtractedInvoice, PurchaseOrder, Vendor } from "@/spacetimedb/src/core/types";
import type { PolicyInput } from "@/spacetimedb/src/core/engine";

export const AS_OF = "2026-06-23T09:00:00.000Z";

export const vendor: Vendor = {
  id: "ven_harbor",
  name: "Harbor Produce Co.",
  category: "Produce",
  expense_account: "5110 Food purchasing",
  bank_last4: "4821",
  bank_changed_at: null,
  heightened_until: null,
  first_seen_at: "2024-03-01T00:00:00.000Z",
  email_domain: "harborproduce.com",
};

export const po: PurchaseOrder = {
  id: "po_h06",
  vendor_id: vendor.id,
  number: "PO-2026-H06",
  amount_cents: 1_450_000,
  description: "Produce",
  status: "open",
  created_at: "2026-06-01T00:00:00.000Z",
};

export const contract: Contract = {
  id: "con_harbor",
  vendor_id: vendor.id,
  kind: "unit_rates",
  monthly_cents: null,
  rates: [
    { item: "Mixed produce case", unit_cents: 2850 },
    { item: "Delivery fee", unit_cents: 7500 },
  ],
  payment_terms_days: 15,
  scope: "fresh produce and delivery",
  effective_from: "2025-07-01T00:00:00.000Z",
};

export function extracted(over: Partial<ExtractedInvoice> = {}): ExtractedInvoice {
  return {
    vendor_name: "Harbor Produce Co.",
    invoice_number: "HP-2000",
    amount_cents: 121_500,
    currency: "USD",
    invoice_date: "2026-06-22",
    due_date: "2026-07-07",
    po_number: "PO-2026-H06",
    remit_bank_last4: "4821",
    line_items: [
      { description: "Mixed produce case", quantity: 40, unit_price_cents: 2850, amount_cents: 114_000 },
      { description: "Delivery fee", quantity: 1, unit_price_cents: 7500, amount_cents: 7500 },
    ],
    notes: null,
    sender_email: null,
    ...over,
  };
}

/** A clean invoice at the top autonomy rung: every rule passes, tier AUTO. */
export function cleanInput(over: Partial<PolicyInput> = {}): PolicyInput {
  const x = extracted();
  return {
    invoice: {
      id: "inv_test",
      invoice_number: x.invoice_number,
      amount_cents: x.amount_cents,
      due_date: "2026-07-07T00:00:00.000Z",
      received_at: AS_OF,
      extracted: x,
    },
    vendor,
    po,
    po_remaining_cents: po.amount_cents,
    contract,
    history: [],
    as_of: AS_OF,
    autonomy: { auto_pay_ceiling_cents: 500_000, rung: 3 },
    ...over,
  };
}
