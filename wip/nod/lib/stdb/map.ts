import type { Contract, ExtractedInvoice, PurchaseOrder, RuleResult, SourceRow, Vendor } from "@/spacetimedb/src/core/types";
import type { CheckInput } from "@/lib/claude/check";
import type { Conn } from "./node";

const parse = <T>(s: string, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export function vendorOf(conn: Conn, vendorId: string): Vendor | null {
  const v = conn.db.vendor.vendorId.find(vendorId);
  if (!v) return null;
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

/** Assembles everything the second reviewer needs from the live cache, after submit_invoice ran. */
export function checkInputFor(conn: Conn, invoiceId: string): CheckInput | null {
  const inv = conn.db.invoice.invoiceId.find(invoiceId);
  const d = conn.db.policyDecision.invoiceId.find(invoiceId);
  if (!inv || !d) return null;
  const vendor = inv.vendorId ? vendorOf(conn, inv.vendorId) : null;
  const poRow = inv.poId ? conn.db.purchaseOrder.poId.find(inv.poId) : null;
  const po: PurchaseOrder | null = poRow
    ? {
        id: poRow.poId,
        vendor_id: poRow.vendorId,
        number: poRow.number,
        amount_cents: poRow.amountCents,
        description: poRow.description,
        status: poRow.status as PurchaseOrder["status"],
        created_at: poRow.createdAt,
      }
    : null;
  const contracts = inv.vendorId
    ? [...conn.db.contract.iter()].filter((c) => c.vendorId === inv.vendorId).map((c) => parse<Contract | null>(c.json, null))
    : [];
  const contract = contracts.filter((c): c is Contract => !!c).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null;
  const recent = inv.vendorId
    ? [...conn.db.invoice.iter()]
        .filter((i) => i.vendorId === inv.vendorId && i.invoiceId !== invoiceId)
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
        .slice(-6)
        .map((i) => ({ invoice_number: i.number, amount_cents: i.amountCents, received_at: i.receivedAt, status: i.status as never }))
    : [];
  return {
    invoice: {
      invoice_number: inv.number,
      amount_cents: inv.amountCents,
      raw_text: inv.rawText,
      extracted: parse<ExtractedInvoice>(inv.extractedJson, {} as ExtractedInvoice),
      received_at: inv.receivedAt,
    },
    vendor,
    po,
    contract,
    recent,
    rules: parse<RuleResult[]>(d.rulesJson, []),
    sources: parse<SourceRow[]>(d.sourcesJson, []),
  };
}
