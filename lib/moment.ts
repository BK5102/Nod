import type { ExtractedInvoice } from "@/spacetimedb/src/core/types";

/**
 * The moment's invoice: Harbor Produce asks, the day before a large payment is due, to be paid into
 * a new account. The vendor record (SEEDED) says the account ends 4821. Fresh number and quantity
 * on every run, so a rerun is judged on its own and not as a duplicate.
 */
export function momentInvoice(): { extracted: ExtractedInvoice; rawText: string } {
  const n = 9900 + Math.floor(Math.random() * 99);
  const cases = 180 + Math.floor(Math.random() * 20);
  const amount = cases * 2850 + 60 * 2200 + 2 * 7500;
  const fmt = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const extracted: ExtractedInvoice = {
    vendor_name: "Harbor Produce Co.",
    invoice_number: `HP-${n}`,
    amount_cents: amount,
    currency: "USD",
    invoice_date: "2026-06-22",
    due_date: "2026-06-23",
    po_number: "PO-2026-H06",
    remit_bank_last4: "7731",
    line_items: [
      { description: "Mixed produce case", quantity: cases, unit_price_cents: 2850, amount_cents: cases * 2850 },
      { description: "Potatoes 50 lb sack", quantity: 60, unit_price_cents: 2200, amount_cents: 132_000 },
      { description: "Delivery fee", quantity: 2, unit_price_cents: 7500, amount_cents: 15_000 },
    ],
    notes: null,
    sender_email: "accounts@harborproduce.com",
  };
  const rawText = [
    "From: Harbor Produce Accounts <accounts@harborproduce.com>",
    `Subject: Invoice HP-${n} for the summer stock-up, new bank details`,
    "",
    "Hello, we changed banks this week. Please send this payment to our new account ending 7731.",
    "It is due tomorrow so we can hold your summer order.",
    "",
    `Invoice No: HP-${n}`,
    "PO: PO-2026-H06",
    `Mixed produce case ${cases} x $28.50 = ${fmt(cases * 2850)}`,
    "Potatoes 50 lb sack 60 x $22.00 = $1,320.00",
    "Delivery fee 2 x $75.00 = $150.00",
    `Total due: ${fmt(amount)}`,
    "Due Date: 2026-06-23",
    "Remit to: account ending 7731",
  ].join("\n");
  return { extracted, rawText };
}
