import type { Contract, ExtractedInvoice, Invoice, PurchaseOrder, Vendor } from "@/lib/domain/types";
import type { World } from "@/lib/store/world";

const SUFFIXES = /\b(the|inc|llc|co|corp|company|ltd|cooperative|coop)\b/g;

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(SUFFIXES, " ").replace(/\s+/g, " ").trim();
}

/** Matches by normalized name. Never by email domain alone: a look-alike domain must not resolve to a vendor. */
export function matchVendor(w: World, extracted: Pick<ExtractedInvoice, "vendor_name">): Vendor | null {
  const n = normalizeName(extracted.vendor_name);
  if (!n) return null;
  return (
    w.vendors.find((v) => normalizeName(v.name) === n) ??
    w.vendors.find((v) => {
      const vn = normalizeName(v.name);
      return vn.length > 4 && (n.includes(vn) || vn.includes(n));
    }) ??
    null
  );
}

export function matchPO(w: World, vendor: Vendor | null, poNumber: string | null): PurchaseOrder | null {
  if (!vendor || !poNumber) return null;
  const n = poNumber.trim().toUpperCase();
  return w.purchase_orders.find((p) => p.vendor_id === vendor.id && p.number.toUpperCase() === n && p.status === "open") ?? null;
}

/** The vendor's open PO with the most room left, used to finish a half-entered bill. */
export function bestOpenPO(w: World, vendor: Vendor, excludeInvoiceId?: string): PurchaseOrder | null {
  const open = w.purchase_orders.filter((p) => p.vendor_id === vendor.id && p.status === "open");
  let best: PurchaseOrder | null = null;
  let room = -1;
  for (const p of open) {
    const r = poRemaining(w, p, excludeInvoiceId);
    if (r > room) {
      best = p;
      room = r;
    }
  }
  return best;
}

const CONSUMING = new Set<Invoice["status"]>(["paid", "awaiting_approval", "awaiting_controller", "payment_pending"]);

/** PO amount less invoices already paid or in flight against it. */
export function poRemaining(w: World, po: PurchaseOrder, excludeInvoiceId?: string): number {
  const used = w.invoices
    .filter((i) => i.po_id === po.id && i.id !== excludeInvoiceId && CONSUMING.has(i.status))
    .reduce((a, i) => a + i.amount_cents, 0);
  return po.amount_cents - used;
}

export function contractFor(w: World, vendor: Vendor | null, at: string): Contract | null {
  if (!vendor) return null;
  return (
    w.contracts
      .filter((c) => c.vendor_id === vendor.id && c.effective_from <= at)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null
  );
}

export function vendorHistory(w: World, vendor: Vendor | null, excludeId?: string): Invoice[] {
  if (!vendor) return [];
  return w.invoices.filter((i) => i.vendor_id === vendor.id && i.id !== excludeId && !i.is_canary);
}

export function lastPaidLast4(w: World, vendor: Vendor | null): string | null {
  if (!vendor) return null;
  const t = w.bank_transfers
    .filter((t) => t.vendor_id === vendor.id && t.status === "executed")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return t.length ? t[t.length - 1]!.to_last4 : null;
}

export function periodOf(iso: string): string {
  return iso.slice(0, 7);
}

/** The period a bill posts to: its own month, or the first open month if that one is closed. */
export function postingPeriod(w: World, invoiceDate: string): { period: string; moved: boolean } {
  const own = periodOf(invoiceDate);
  const closed = w.sim_state.closed_through;
  if (!closed || own > closed) return { period: own, moved: false };
  const [y, m] = closed.split("-").map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { period: next, moved: true };
}
