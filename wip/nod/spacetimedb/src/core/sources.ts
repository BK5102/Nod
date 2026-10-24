import type { Contract, ExtractedInvoice, PurchaseOrder, SourceRow, Vendor } from "./types";
import { formatCents } from "./money";
import { matchRate } from "./engine";

/**
 * System of record per field. When sources disagree, this table decides who wins, and the
 * reason is printed next to every decision. It is fixed policy, not something Claude decides.
 */
export const SYSTEM_OF_RECORD = {
  payee: { source: "vendor_master", why: "The vendor list is maintained by the controller; an invoice can be sent by anyone." },
  bank_account: { source: "vendor_master", why: "Bank details change only through a controller callback, never from an invoice." },
  authorized_amount: { source: "purchase_order", why: "A purchase order is the board-approved spending authority." },
  unit_price: { source: "contract", why: "The signed contract sets price; the invoice is the vendor's claim." },
  total: { source: "invoice", why: "The invoice is what is owed if its own lines add up and it fits the PO and contract." },
  payment_terms: { source: "contract", why: "Terms are agreed in the contract; a shorter due date on an invoice is a request, not an obligation." },
} as const;

export interface SourceInput {
  extracted: ExtractedInvoice;
  amount_cents: number;
  received_at: string;
  vendor: Vendor | null;
  po: PurchaseOrder | null;
  po_remaining_cents: number | null;
  contract: Contract | null;
  /** Last account Nod actually paid this vendor, from executed bank transfers. */
  last_paid_last4: string | null;
}

export function checkSources(i: SourceInput): SourceRow[] {
  const rows: SourceRow[] = [];
  const x = i.extracted;

  // Payee
  {
    const values: SourceRow["values"] = [{ source: "invoice", value: x.vendor_name || "(blank)" }];
    if (x.sender_email) values.push({ source: "invoice", value: `sent from ${x.sender_email}` });
    values.push({ source: "vendor_master", value: i.vendor ? `${i.vendor.name} <@${i.vendor.email_domain}>` : "not on file" });
    const domainOk = !x.sender_email || !i.vendor || x.sender_email.toLowerCase().endsWith(`@${i.vendor.email_domain.toLowerCase()}`);
    rows.push({
      field: "Payee",
      values,
      agree: !!i.vendor && domainOk,
      system_of_record: SYSTEM_OF_RECORD.payee.source,
      trusted_value: i.vendor?.name ?? "unknown vendor",
      why: SYSTEM_OF_RECORD.payee.why,
    });
  }

  // Bank account
  {
    const values: SourceRow["values"] = [
      { source: "invoice", value: x.remit_bank_last4 ? `ending ${x.remit_bank_last4}` : "not stated" },
      { source: "vendor_master", value: i.vendor ? `ending ${i.vendor.bank_last4}` : "not on file" },
      { source: "bank_history", value: i.last_paid_last4 ? `last paid to ${i.last_paid_last4}` : "never paid" },
    ];
    const known = [x.remit_bank_last4, i.vendor?.bank_last4, i.last_paid_last4].filter((v): v is string => !!v);
    rows.push({
      field: "Bank account",
      values,
      agree: new Set(known).size <= 1,
      system_of_record: SYSTEM_OF_RECORD.bank_account.source,
      trusted_value: i.vendor ? `ending ${i.vendor.bank_last4}` : "none: will not pay",
      why: SYSTEM_OF_RECORD.bank_account.why,
    });
  }

  // Amount against authority
  {
    const lineSum = x.line_items.reduce((a, l) => a + l.amount_cents, 0);
    const values: SourceRow["values"] = [{ source: "invoice", value: `total ${formatCents(i.amount_cents)}` }];
    if (x.line_items.length) values.push({ source: "invoice", value: `lines add to ${formatCents(lineSum)}` });
    values.push({
      source: "purchase_order",
      value: i.po ? `${i.po.number}: ${formatCents(i.po_remaining_cents ?? i.po.amount_cents)} left` : "no PO",
    });
    const linesOk = !x.line_items.length || Math.abs(lineSum - i.amount_cents) <= 100;
    const poOk = !!i.po && i.amount_cents <= (i.po_remaining_cents ?? i.po.amount_cents);
    rows.push({
      field: "Amount",
      values,
      agree: linesOk && poOk,
      system_of_record: SYSTEM_OF_RECORD.authorized_amount.source,
      trusted_value: i.po ? `up to ${formatCents(i.po_remaining_cents ?? i.po.amount_cents)}` : "no authority on file",
      why: SYSTEM_OF_RECORD.authorized_amount.why,
    });
  }

  // Price against contract
  if (i.contract) {
    const c = i.contract;
    if (c.kind === "fixed_monthly" && c.monthly_cents !== null) {
      rows.push({
        field: "Price",
        values: [
          { source: "invoice", value: formatCents(i.amount_cents) },
          { source: "contract", value: `${formatCents(c.monthly_cents)} a month` },
        ],
        agree: Math.abs(i.amount_cents - c.monthly_cents) <= 100,
        system_of_record: SYSTEM_OF_RECORD.unit_price.source,
        trusted_value: formatCents(c.monthly_cents),
        why: SYSTEM_OF_RECORD.unit_price.why,
      });
    } else {
      const priced = x.line_items
        .filter((l) => l.unit_price_cents !== null)
        .map((l) => ({ l, r: matchRate(c, l.description) }))
        .filter((p) => p.r);
      const off = priced.filter((p) => p.l.unit_price_cents! > p.r!.unit_cents);
      const outOfScope = x.line_items.filter((l) => !matchRate(c, l.description));
      rows.push({
        field: "Price",
        values: [
          {
            source: "invoice",
            value: priced.length
              ? priced.map((p) => `${p.l.description} ${formatCents(p.l.unit_price_cents!)}`).join(", ")
              : "no unit prices",
          },
          {
            source: "contract",
            value: priced.length ? priced.map((p) => `${p.r!.item} ${formatCents(p.r!.unit_cents)}`).join(", ") : c.scope,
          },
        ],
        agree: off.length === 0 && outOfScope.length === 0,
        system_of_record: SYSTEM_OF_RECORD.unit_price.source,
        trusted_value: off.length
          ? off.map((p) => `${p.r!.item} at ${formatCents(p.r!.unit_cents)}`).join(", ")
          : outOfScope.length
            ? `not in contract scope: ${outOfScope.map((l) => l.description).join(", ")}`
            : "contract rates",
        why: SYSTEM_OF_RECORD.unit_price.why,
      });
    }

    if (x.due_date) {
      const termsDue = new Date(new Date(x.invoice_date ?? i.received_at).getTime() + c.payment_terms_days * 86_400_000);
      const early = new Date(x.due_date).getTime() < termsDue.getTime() - 86_400_000;
      rows.push({
        field: "Due date",
        values: [
          { source: "invoice", value: x.due_date.slice(0, 10) },
          { source: "contract", value: `net ${c.payment_terms_days}: ${termsDue.toISOString().slice(0, 10)}` },
        ],
        agree: !early,
        system_of_record: SYSTEM_OF_RECORD.payment_terms.source,
        trusted_value: termsDue.toISOString().slice(0, 10),
        why: SYSTEM_OF_RECORD.payment_terms.why,
      });
    }
  }

  return rows;
}
