import type { Actor, Contract, PurchaseOrder, Vendor } from "@/lib/domain/types";

/** Eastbay Community Pantry. Fictional. Every name, number and account here is invented. */
export const COMPANY = {
  name: "Eastbay Community Pantry",
  short: "Eastbay Pantry",
  seats: "Accounts payable clerk and payments specialist at a small food-bank nonprofit",
  opening_balance_cents: 18_500_000, // $185,000
  history_start: "2026-01-02T09:00:00.000Z",
  demo_as_of: "2026-06-23T09:00:00.000Z",
};

export const ACTORS: Actor[] = [
  { id: "act_agent", name: "Nod", role: "agent" },
  { id: "act_maya", name: "Maya Okafor, finance lead", role: "approver" },
  { id: "act_rosa", name: "Rosa Delgado, executive director (backup approver)", role: "approver" },
  { id: "act_luis", name: "Luis Ortega, controller", role: "controller" },
  { id: "act_audit", name: "External auditor", role: "auditor" },
];

const old = "2024-03-01T00:00:00.000Z";

export const VENDORS: Vendor[] = [
  { id: "ven_harbor", name: "Harbor Produce Co.", category: "Produce wholesaler", expense_account: "5110 Food purchasing", bank_last4: "4821", bank_changed_at: null, heightened_until: null, first_seen_at: old, email_domain: "harborproduce.com" },
  { id: "ven_dairy", name: "Golden State Dairy Cooperative", category: "Dairy and eggs", expense_account: "5110 Food purchasing", bank_last4: "1934", bank_changed_at: null, heightened_until: null, first_seen_at: old, email_domain: "goldenstatedairy.com" },
  { id: "ven_bayline", name: "Bayline Printing", category: "Printing", expense_account: "5300 Outreach and printing", bank_last4: "7716", bank_changed_at: null, heightened_until: null, first_seen_at: old, email_domain: "baylineprinting.com" },
  { id: "ven_fleet", name: "Eastbay Fleet Lease", category: "Van lease", expense_account: "5400 Vehicle lease", bank_last4: "2280", bank_changed_at: null, heightened_until: null, first_seen_at: old, email_domain: "eastbayfleet.com" },
  { id: "ven_clean", name: "CleanPath Janitorial", category: "Cleaning", expense_account: "5500 Facilities", bank_last4: "6603", bank_changed_at: null, heightened_until: null, first_seen_at: old, email_domain: "cleanpath.net" },
  { id: "ven_power", name: "East Shore Power & Water", category: "Utilities", expense_account: "5510 Utilities", bank_last4: "3057", bank_changed_at: null, heightened_until: null, first_seen_at: old, email_domain: "eastshoreutility.com" },
  { id: "ven_cold", name: "Northgate Cold Storage", category: "Refrigeration repair", expense_account: "5520 Equipment repair", bank_last4: "5129", bank_changed_at: null, heightened_until: null, first_seen_at: old, email_domain: "northgatecold.com" },
  { id: "ven_pest", name: "SafeKeep Pest Control", category: "Pest control", expense_account: "5500 Facilities", bank_last4: "8840", bank_changed_at: null, heightened_until: null, first_seen_at: old, email_domain: "safekeeppest.com" },
  { id: "ven_pallet", name: "Tri-Valley Pallet Supply", category: "Warehouse supplies", expense_account: "5120 Warehouse supplies", bank_last4: "3312", bank_changed_at: null, heightened_until: null, first_seen_at: "2026-05-01T00:00:00.000Z", email_domain: "trivalleypallet.com" },
];

export const CHART_OF_ACCOUNTS: { code: string; name: string; type: "asset" | "liability" | "net_assets" | "expense" }[] = [
  { code: "1000", name: "Cash - operating bank", type: "asset" },
  { code: "2000", name: "Accounts payable", type: "liability" },
  { code: "3000", name: "Net assets", type: "net_assets" },
  { code: "5110", name: "Food purchasing", type: "expense" },
  { code: "5120", name: "Warehouse supplies", type: "expense" },
  { code: "5300", name: "Outreach and printing", type: "expense" },
  { code: "5400", name: "Vehicle lease", type: "expense" },
  { code: "5500", name: "Facilities", type: "expense" },
  { code: "5510", name: "Utilities", type: "expense" },
  { code: "5520", name: "Equipment repair", type: "expense" },
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
  { id: "con_fleet", vendor_id: "ven_fleet", kind: "fixed_monthly", monthly_cents: 114_500, rates: [], payment_terms_days: 30, scope: "one refrigerated van lease", effective_from: "2025-01-01T00:00:00.000Z" },
  { id: "con_clean", vendor_id: "ven_clean", kind: "fixed_monthly", monthly_cents: 68_000, rates: [], payment_terms_days: 30, scope: "weekly warehouse cleaning", effective_from: "2025-01-01T00:00:00.000Z" },
  {
    id: "con_cold",
    vendor_id: "ven_cold",
    kind: "hourly",
    monthly_cents: null,
    rates: [
      { item: "Technician labor hour", unit_cents: 14500 },
      { item: "Compressor unit", unit_cents: 980000 },
      { item: "Refrigerant recharge", unit_cents: 32000 },
      { item: "Service call fee", unit_cents: 12500 },
    ],
    payment_terms_days: 30,
    scope: "walk-in cooler and freezer repair",
    effective_from: "2025-01-01T00:00:00.000Z",
  },
  { id: "con_pest", vendor_id: "ven_pest", kind: "fixed_monthly", monthly_cents: 39_000, rates: [], payment_terms_days: 30, scope: "quarterly pest service", effective_from: "2025-01-01T00:00:00.000Z" },
  {
    id: "con_pallet",
    vendor_id: "ven_pallet",
    kind: "unit_rates",
    monthly_cents: null,
    rates: [
      { item: "Pallets grade B", unit_cents: 950 },
      { item: "Stretch wrap roll", unit_cents: 2400 },
    ],
    payment_terms_days: 30,
    scope: "pallets and wrap",
    effective_from: "2026-05-01T00:00:00.000Z",
  },
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
  ...["01", "02", "03", "04", "05", "06"].map((m) =>
    po(`po_h${m}`, "ven_harbor", `PO-2026-H${m}`, 1_450_000, `Produce, 2026-${m} blanket`, `2026-${m}-01T00:00:00.000Z`),
  ),
  po("po_d1", "ven_dairy", "PO-2026-D1", 750_000, "Dairy, Q1 blanket", "2026-01-01T00:00:00.000Z"),
  po("po_d2", "ven_dairy", "PO-2026-D2", 750_000, "Dairy, Q2 blanket", "2026-04-01T00:00:00.000Z"),
  po("po_b1", "ven_bayline", "PO-2026-B1", 600_000, "Printing, 2026", "2026-01-01T00:00:00.000Z"),
  po("po_f1", "ven_fleet", "PO-2026-F1", 1_374_000, "Van lease, 2026", "2026-01-01T00:00:00.000Z"),
  po("po_c1", "ven_clean", "PO-2026-C1", 900_000, "Cleaning, 2026", "2026-01-01T00:00:00.000Z"),
  po("po_u1", "ven_power", "PO-2026-U1", 1_100_000, "Utilities, 2026", "2026-01-01T00:00:00.000Z"),
  po("po_n1", "ven_cold", "PO-2026-N1", 200_000, "Cooler service, H1", "2026-01-01T00:00:00.000Z"),
  po("po_n2", "ven_cold", "PO-2026-N2", 1_000_000, "Freezer compressor job", "2026-06-01T00:00:00.000Z"),
  po("po_s1", "ven_pest", "PO-2026-S1", 156_000, "Pest service, 2026", "2026-01-01T00:00:00.000Z"),
  po("po_p1", "ven_pallet", "PO-2026-P1", 300_000, "Pallets and wrap", "2026-05-01T00:00:00.000Z"),
];
