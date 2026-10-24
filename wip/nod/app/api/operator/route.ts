import { connection } from "@/lib/stdb/server";
import { body, fail, ok } from "@/lib/server/http";
import { addDays } from "@/spacetimedb/src/core/money";
import { renderInvoice } from "@/lib/seed/render";
import { VENDORS } from "@/lib/seed/company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type In = { action: "advance_days"; days: number } | { action: "outage"; on: boolean } | { action: "inject_canary" };

// The replay clock and extra canaries are off for the demo (scope cut). Set NOD_SIM_CLOCK=1 to allow them.
const EXTRAS = process.env.NOD_SIM_CLOCK === "1";

/** Simulation controls, run as the operator identity. Labeled SIMULATED in the UI. */
export async function POST(req: Request) {
  try {
    const b = await body<In>(req);
    const op = await connection("operator");
    const c = op.db.simClock.id.find(1);
    if (!c) throw new Error("The database has not been seeded");
    if ((b.action === "advance_days" || b.action === "inject_canary") && !EXTRAS) throw new Error("That simulation control is turned off for this demo.");
    if (b.action === "advance_days") {
      const days = Math.max(1, Math.min(60, Math.round(b.days)));
      await op.reducers.setClock({ asOf: addDays(c.asOf, days) });
      return ok({ asOf: addDays(c.asOf, days) });
    }
    if (b.action === "outage") {
      await op.reducers.setBankOutage({ on: !!b.on });
      return ok({ outage: !!b.on });
    }
    // A plausible-looking but wrong bill from a real vendor: the approver should refuse it.
    const v = VENDORS.find((x) => x.id === "ven_bayline")!;
    const n = Math.floor(Math.random() * 900) + 100;
    const date = c.asOf.slice(0, 10);
    const extracted = {
      vendor_name: v.name,
      invoice_number: `BL-${3400 + n}`,
      amount_cents: 360_000,
      currency: "USD",
      invoice_date: date,
      due_date: addDays(c.asOf, 30).slice(0, 10),
      po_number: "PO-2026-B1",
      remit_bank_last4: v.bank_last4,
      line_items: [{ description: "Posters", quantity: 300, unit_price_cents: 1_200, amount_cents: 360_000 }],
      notes: null,
      sender_email: null,
    };
    const id = `cn_live_${Date.now().toString(36)}`;
    await op.reducers.injectCanary({
      invoiceId: id,
      extractedJson: JSON.stringify(extracted),
      rawText: renderInvoice("pdf", v, extracted),
      sourceFormat: "pdf",
      filePath: "",
      extractionMethod: "seed",
      handoffJson: "",
    });
    const agent = await connection("agent");
    await agent.reducers.escalateInvoice({ invoiceId: id, claudeJson: JSON.stringify({ trusted_source: "vendor_record", trust_reason: "Planted attention check.", flags: [], explanation: "Attention check.", method: "heuristic" }) });
    return ok({ injected: true });
  } catch (e) {
    return fail(e);
  }
}
