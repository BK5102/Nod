import { extractInvoice } from "@/lib/claude/extract";
import { body, fail, ok } from "@/lib/server/http";
import type { SourceFormat } from "@/spacetimedb/src/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface In {
  text?: string;
  file_base64?: string;
  media_type?: string;
}

const MAX_TEXT = 20_000;
const MAX_FILE_B64 = 6_000_000; // about 4.5 MB of file
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Stage 1, "Reading invoice": Claude turns text, a photo or a PDF into checked fields. */
export async function POST(req: Request) {
  const t = Date.now();
  try {
    const b = await body<In>(req);
    const text = (b.text ?? "").slice(0, MAX_TEXT);
    if (!text.trim() && !b.file_base64) throw new Error("Paste invoice text or attach a photo or PDF.");
    if (b.file_base64 && b.file_base64.length > MAX_FILE_B64) throw new Error("That file is too large. Keep it under 4 MB.");
    if (b.file_base64 && b.media_type !== "application/pdf" && !IMAGE_TYPES.includes(b.media_type ?? "")) {
      throw new Error("Attach a PDF or a PNG, JPEG or WebP photo.");
    }
    const format: SourceFormat = b.file_base64 ? (b.media_type === "application/pdf" ? "pdf" : "image") : /^from:/im.test(text) ? "email" : "text";
    const ex = await extractInvoice({ format, text: text || undefined, file_base64: b.file_base64, media_type: b.media_type });
    if (!ex.extracted.amount_cents) throw new Error("Claude read the invoice but found no total. Check that it shows an amount due.");
    return ok({ extracted: ex.extracted, format, rawText: text || `[${format} uploaded]`, ms: Date.now() - t });
  } catch (e) {
    return fail(e, 502);
  }
}
