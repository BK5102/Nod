import { simulateCallback } from "@/lib/claude/controller";
import { connection } from "@/lib/stdb/server";
import { vendorOf } from "@/lib/stdb/map";
import { body, fail, ok } from "@/lib/server/http";
import { INVOICE_SPECS } from "@/lib/seed/scenario";
import type { ExtractedInvoice } from "@/spacetimedb/src/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * SIMULATED out-of-band callback: the controller phones the vendor at the number on file. The
 * vendor's answer comes from the simulated world (whether the vendor really changed banks), never
 * from the invoice. This only produces a transcript; the controller still records the decision.
 */
export async function POST(req: Request) {
  try {
    const { invoiceId } = await body<{ invoiceId: string }>(req);
    const agent = await connection("agent");
    const inv = agent.db.invoice.invoiceId.find(invoiceId);
    if (!inv) throw new Error("Invoice not found");
    const vendor = inv.vendorId ? vendorOf(agent, inv.vendorId) : null;
    if (!vendor) throw new Error("No vendor on file to call");
    const spec = INVOICE_SPECS.find((s) => s.id === invoiceId);
    // Seeded invoices know the truth. A live invoice asking for a new account is treated as a redirect attempt.
    const reallyChanged = spec ? spec.answer.error_type !== "bank_change_fraud" : false;
    const call = await simulateCallback({
      vendor,
      invoice: { invoice_number: inv.number, amount_cents: inv.amountCents, extracted: JSON.parse(inv.extractedJson) as ExtractedInvoice },
      vendor_really_changed: reallyChanged,
    });
    return ok(call);
  } catch (e) {
    return fail(e);
  }
}
