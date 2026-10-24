import type { Actor, Contract, PurchaseOrder, Vendor } from "@/spacetimedb/src/core/types";

/** Eastbay Community Pantry. Fictional. Every name, number and account here is invented. */
export const COMPANY = {
  name: "Eastbay Community Pantry",
  short: "Eastbay Pantry",
  seats: "Accounts payable clerk and payments specialist at a small food-bank nonprofit",
  opening_balance_cents: 18_500_000, // $185,000
  history_start: "2026-06-01T08:00:00.000Z",
  demo_as_of: "2026-06-23T09:00:00.000Z",
};

export const ACTORS: Actor[] = [
  { id: "act_agent", name: "Nod", role: "agent" },
  { id: "act_maya", name: "Maya Okafor, finance lead", role: "approver" },
  { id: "act_rosa", name: "Rosa Delgado, executive director (backup approver)", role: "approver" },
  { id: "act_luis", name: "Luis Ortega, controller", role: "controller" },
  { id: "act_audit", name: "External auditor", role: "auditor" },
  { id: "act_operator", name: "Demo operator (simulation controls)", role: "operator" },
];

const old = "2024-03-01T00:00:00.000Z";

export const VENDORS: Vendor[] = [
  { id: "ven_harbor", name: "Harbor Produce Co.", category: "Produce wholesaler", expense_account: "5110 Food purchasing", bank_last4: "4821", bank_changed_at: null, heightened_until: null, first_seen_at: old, email_domain: "harborproduce.com" },
  { id: "ven_dairy", name: "Golden State Dairy Cooperative", category: "Dairy and eggs", expense_account: "5110 Food purchasing", bank_last4: "1934", bank_changed_at: null, heightened_until: null, first_seen_at: old, email_domain: "goldenstatedairy.com" },
  { id: "ven_bayline", name: "Bayline Printing", category: "Printing", expense_account: "5300 Outreach and printing", bank_last4: "7716", bank_changed_at: null, heightened_until: null, first_seen_at: old, email_domain: "baylineprinting.com" },
  { id: "ven_clean", name: "CleanPath Janitorial", category: "Cleaning", expense_account: "5500 Facilities", bank_last4: "6603", bank_changed_at: null, heightened_until: null, first_seen_at: old, email_domain: "cleanpath.net" },
];

export const CHART_OF_ACCOUNTS: { code: string; name: string; type: "asset" | "liability" | "net_assets" | "expense" }[] = [
  { code: "1000", name: "Cash - operating bank", type: "asset" },
  { code: "2000", name: "Accounts payable", type: "liability" },
  { code: "3000", name: "Net assets", type: "net_assets" },
  { code: "5110", name: "Food purchasing", type: "expense" },
  { code: "5300", name: "Outreach and printing", type: "expense" },
  { code: "5500", name: "Facilities", type: "expense" },
];

export const CONTRACTS: Contract[] = [
  {
    id: "con_harbor",
    vendor_id: "ven_harbor",
    kind: "unit_rates",
    monthly_cents: null,
    rates: [
      { item: "Mixed produce case", unit_cents: 2850 },
      { item: "Potatoes 50 lb sack", unit_cents: 2200 },
      { item: "Onions 50 lb sack", unit_cents: 2400 },
      { item: "Apples case", unit_cents: 3100 },
      { item: "Delivery fee", unit_cents: 7500 },
    ],
    payment_terms_days: 15,
    scope: "fresh produce and delivery",
    effective_from: "2025-07-01T00:00:00.000Z",
  },
  {
    id: "con_dairy",
    vendor_id: "ven_dairy",
    kind: "unit_rates",
    monthly_cents: null,
    rates: [
      { item: "Milk gallon case (4)", unit_cents: 1320 },
      { item: "Eggs 15 dozen case", unit_cents: 4200 },
      { item: "Yogurt case", unit_cents: 1850 },
    ],
    payment_terms_days: 15,
    scope: "milk, eggs and yogurt",
    effective_from: "2025-07-01T00:00:00.000Z",
  },
  {
    id: "con_bayline",
    vendor_id: "ven_bayline",
    kind: "unit_rates",
    monthly_cents: null,
    rates: [
      { item: "Flyers 1000 count", unit_cents: 18500 },
      { item: "Posters", unit_cents: 1200 },
      { item: "Volunteer badges 100 count", unit_cents: 6400 },
    ],
    payment_terms_days: 30,
    scope: "print jobs",
    effective_from: "2025-07-01T00:00:00.000Z",
  },
  { id: "con_clean", vendor_id: "ven_clean", kind: "fixed_monthly", monthly_cents: 68_000, rates: [], payment_terms_days: 30, scope: "weekly warehouse cleaning", effective_from: "2025-01-01T00:00:00.000Z" },
];

const po = (id: string, vendor_id: string, number: string, amount_cents: number, description: string, created_at: string): PurchaseOrder => ({
  id,
  vendor_id,
  number,
  amount_cents,
  description,
  status: "open",
  created_at,
});

export const PURCHASE_ORDERS: PurchaseOrder[] = [
  po("po_h06", "ven_harbor", "PO-2026-H06", 2_000_000, "Produce, June blanket", "2026-06-01T00:00:00.000Z"),
  po("po_d2", "ven_dairy", "PO-2026-D2", 750_000, "Dairy, Q2 blanket", "2026-04-01T00:00:00.000Z"),
  po("po_b1", "ven_bayline", "PO-2026-B1", 600_000, "Printing, 2026", "2026-01-01T00:00:00.000Z"),
  po("po_c1", "ven_clean", "PO-2026-C1", 900_000, "Cleaning, 2026", "2026-01-01T00:00:00.000Z"),
];
