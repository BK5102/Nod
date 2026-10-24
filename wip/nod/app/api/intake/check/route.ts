import { ExtractedInvoiceSchema } from "@/lib/claude/schemas";
import { connection } from "@/lib/stdb/server";
import { waitFor } from "@/lib/stdb/node";
import { body, fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface In {
  extracted: unknown;
  rawText: string;
  format: string;
}

/**
 * Stage 2, "Checking vendor history": the agent submits the bill, and the database matches the
 * vendor, PO and contract, compares every source with its system of record, and sets the tier.
 */
export async function POST(req: Request) {
  const t = Date.now();
  try {
    const b = await body<In>(req);
    const parsed = ExtractedInvoiceSchema.safeParse(b.extracted);
    if (!parsed.success) throw new Error("The extracted fields are not in the expected shape.");
    const agent = await connection("agent");
    const invoiceId = `inv_live_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    await agent.reducers.submitInvoice({
      invoiceId,
      extractedJson: JSON.stringify(parsed.data),
      rawText: String(b.rawText ?? "").slice(0, 20_000),
      sourceFormat: ["pdf", "email", "image", "text"].includes(b.format) ? b.format : "text",
      filePath: "",
      extractionMethod: "claude",
      handoffJson: "",
    });
    const d = await waitFor(() => agent.db.policyDecision.invoiceId.find(invoiceId), "the policy decision", 15_000);
    const inv = agent.db.invoice.invoiceId.find(invoiceId);
    const vendor = inv?.vendorId ? agent.db.vendor.vendorId.find(inv.vendorId) : undefined;
    return ok({
      invoiceId,
      ruleTier: d.ruleTier,
      rules: JSON.parse(d.rulesJson),
      sources: JSON.parse(d.sourcesJson),
      vendor: vendor ? { name: vendor.name, bankLast4: vendor.bankLast4, seeded: true } : null,
      ms: Date.now() - t,
    });
  } catch (e) {
    return fail(e, 502);
  }
}
