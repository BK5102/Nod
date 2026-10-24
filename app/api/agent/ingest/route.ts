import { extractInvoice } from "@/lib/claude/extract";
import { ingestOne } from "@/lib/agent/run";
import { connection } from "@/lib/stdb/server";
import { body, fail, ok } from "@/lib/server/http";
import type { SourceFormat } from "@/spacetimedb/src/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface In {
  text?: string;
  file_base64?: string;
  media_type?: string;
  format?: SourceFormat;
}

const MAX_TEXT = 20_000;
const MAX_FILE = 4_000_000;

/** Anyone (including a judge) can hand the agent a new invoice: pasted text, a PDF or an image. */
export async function POST(req: Request) {
  try {
    const b = await body<In>(req);
    const text = (b.text ?? "").slice(0, MAX_TEXT);
    if (!text.trim() && !b.file_base64) return fail(new Error("Paste invoice text or attach a PDF or image."));
    if (b.file_base64 && b.file_base64.length > MAX_FILE) return fail(new Error("File is too large. Keep it under 3 MB."));
    const format: SourceFormat = b.file_base64 ? (b.media_type === "application/pdf" ? "pdf" : "image") : /^from:/im.test(text) ? "email" : "text";
    const ex = await extractInvoice({ format, text: text || undefined, file_base64: b.file_base64, media_type: b.media_type });
    if (!ex.extracted.amount_cents) return fail(new Error("Could not find a total on that invoice. Add a line like 'Total: $1,234.00'."));
    const agent = await connection("agent");
    const result = await ingestOne(agent, {
      extracted: ex.extracted,
      rawText: text || `[${format} file]`,
      sourceFormat: format,
      extractionMethod: ex.method,
    });
    return ok({ ...result, extraction: ex.method, warning: ex.warning });
  } catch (e) {
    return fail(e);
  }
}
