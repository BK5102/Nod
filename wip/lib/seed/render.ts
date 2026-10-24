import type { ExtractedInvoice, SourceFormat, Vendor } from "@/lib/domain/types";
import { formatCents } from "@/lib/domain/money";

/** Renders an invoice as the raw text its source format would produce. Deliberately inconsistent across vendors. */
export function renderInvoice(
  format: SourceFormat,
  v: Pick<Vendor, "name" | "email_domain">,
  x: ExtractedInvoice,
  opts: { extra?: string; senderName?: string } = {},
): string {
  const lines = x.line_items.map((l) =>
    l.quantity !== null && l.unit_price_cents !== null
      ? `${l.description} ${l.quantity} x ${formatCents(l.unit_price_cents)} = ${formatCents(l.amount_cents)}`
      : `${l.description}  ${formatCents(l.amount_cents)}`,
  );
  const remit = x.remit_bank_last4 ? `Remit to: account ending ${x.remit_bank_last4}` : "";
  if (format === "email") {
    const from = x.sender_email ?? `billing@${v.email_domain}`;
    return [
      `From: ${opts.senderName ?? `${v.name} Billing`} <${from}>`,
      `To: ap@eastbaypantry.org`,
      `Subject: Invoice ${x.invoice_number}`,
      `Date: ${x.invoice_date}`,
      ``,
      `Hello Eastbay team,`,
      ``,
      `Please find our invoice below.`,
      ``,
      `Vendor: ${v.name}`,
      `Invoice No: ${x.invoice_number}`,
      `Invoice Date: ${x.invoice_date}`,
      x.po_number ? `PO: ${x.po_number}` : ``,
      ...lines,
      `Total due: ${formatCents(x.amount_cents)}`,
      x.due_date ? `Due Date: ${x.due_date}` : ``,
      remit,
      opts.extra ?? ``,
      ``,
      `Thank you,`,
      `${v.name} accounts`,
    ]
      .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
      .join("\n");
  }
  if (format === "image") {
    // What a phone photo of a paper invoice reads like after OCR: caps, uneven spacing.
    return [
      v.name.toUpperCase(),
      `INVOICE   # ${x.invoice_number}`,
      `DATE ${x.invoice_date}      DUE ${x.due_date ?? "ON RECEIPT"}`,
      `BILL TO  EASTBAY COMMUNITY PANTRY`,
      x.po_number ? `P.O. ${x.po_number}` : ``,
      ``,
      ...lines.map((l) => l.toUpperCase()),
      ``,
      `TOTAL  ${formatCents(x.amount_cents)}`,
      remit.toUpperCase(),
      opts.extra ?? ``,
    ].join("\n");
  }
  return [
    v.name,
    `Invoice`,
    `Invoice No: ${x.invoice_number}`,
    `Invoice Date: ${x.invoice_date}`,
    x.due_date ? `Due Date: ${x.due_date}` : ``,
    `Bill To: Eastbay Community Pantry, 2100 Foothill Blvd, Oakland CA`,
    x.po_number ? `PO Number: ${x.po_number}` : ``,
    ``,
    ...lines,
    ``,
    `Total: ${formatCents(x.amount_cents)}`,
    remit,
    opts.extra ?? ``,
  ].join("\n");
}
