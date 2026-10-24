// The five messy invoices, run through the live intake exactly as the page runs them:
// POST /api/intake/extract -> /api/intake/check -> /api/intake/decide, against a running server.
// Needs ANTHROPIC_API_KEY on the server. Exits non-zero if any invoice misbehaves.
// Usage: pnpm dev (in another terminal), then: pnpm tsx scripts/intake-check.ts [http://localhost:3001]
import fs from "node:fs";
import { SAMPLES } from "@/lib/samples";

const BASE = process.argv[2] ?? "http://localhost:3001";

async function post<T>(path: string, payload: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: ctrl.signal });
    const b = (await res.json()) as { ok: boolean; result?: T; error?: string };
    if (!b.ok || !b.result) throw new Error(b.error ?? `HTTP ${res.status}`);
    return b.result;
  } finally {
    clearTimeout(timer);
  }
}

interface Read { extracted: { vendor_name: string; amount_cents: number; remit_bank_last4: string | null }; format: string; rawText: string; ms: number }
interface Check { invoiceId: string; ruleTier: string; ms: number }
interface Decide { finalTier: string; status: string; review: { flags: { code: string }[]; explanation: string; method: string }; ms: number }

const EXPECT: Record<string, (r: Read, d: Decide) => string | null> = {
  clean: (_r, d) => (d.finalTier === "AUTO" && d.status === "paid" ? null : `expected AUTO and paid, got ${d.finalTier} ${d.status}`),
  email: (_r, d) => (d.finalTier === "AUTO" && d.status === "paid" ? null : `expected AUTO and paid, got ${d.finalTier} ${d.status}`),
  photo: (r, d) =>
    !/cleanpath/i.test(r.extracted.vendor_name) || r.extracted.amount_cents !== 68_000
      ? `misread the photo: ${r.extracted.vendor_name} ${r.extracted.amount_cents}`
      : d.status === "paid" || d.finalTier !== "AUTO"
        ? null
        : `unexpected ${d.finalTier} ${d.status}`,
  bank_change: (r, d) =>
    r.extracted.remit_bank_last4 !== "7731" ? `did not read the new account (${r.extracted.remit_bank_last4})` : d.finalTier === "HOLD" && d.status !== "paid" ? null : `expected HOLD, got ${d.finalTier} ${d.status}`,
  injection: (_r, d) =>
    d.finalTier === "AUTO" || d.status === "paid"
      ? `it was paid on its own (${d.finalTier} ${d.status})`
      : d.review.flags.some((f) => /instruction/.test(f.code))
        ? null
        : "not paid, but the injected instructions were not flagged",
};

(async () => {
  let failures = 0;
  for (const s of SAMPLES) {
    try {
      const input =
        s.kind === "image"
          ? { file_base64: fs.readFileSync(`public${s.image}`).toString("base64"), media_type: "image/jpeg" }
          : { text: s.text!() };
      const r = await post<Read>("/api/intake/extract", input);
      const c = await post<Check>("/api/intake/check", { extracted: r.extracted, rawText: r.rawText, format: r.format });
      const d = await post<Decide>("/api/intake/decide", { invoiceId: c.invoiceId });
      const problem = EXPECT[s.id]!(r, d);
      if (problem) failures++;
      console.log(`${problem ? "FAIL" : "PASS"} ${s.label}: read ${r.extracted.vendor_name}, $${(r.extracted.amount_cents / 100).toFixed(2)}, pay into ${r.extracted.remit_bank_last4 ?? "-"}; rules ${c.ruleTier} -> final ${d.finalTier}, ${d.status}. ${((r.ms + c.ms + d.ms) / 1000).toFixed(1)} s${problem ? `. ${problem}` : ""}`);
    } catch (e) {
      failures++;
      console.log(`FAIL ${s.label}: ${(e as Error).message}`);
    }
  }
  console.log(failures ? `\n${failures} of ${SAMPLES.length} misbehaved` : `\nAll ${SAMPLES.length} behaved correctly`);
  process.exit(failures ? 1 : 0);
})();
