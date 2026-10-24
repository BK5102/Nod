"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ClaudeCheck, ExtractedInvoice, RuleResult } from "@/spacetimedb/src/core/types";
import { SAMPLES, type Sample } from "@/lib/samples";
import { money, STATUS_WORDS } from "@/lib/ui/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StageId = "read" | "check" | "decide";
type StageState = "waiting" | "running" | "done" | "failed";
const STAGES: { id: StageId; label: string; url: string }[] = [
  { id: "read", label: "Reading invoice", url: "/api/intake/extract" },
  { id: "check", label: "Checking vendor history", url: "/api/intake/check" },
  { id: "decide", label: "Deciding", url: "/api/intake/decide" },
];
const TIMEOUT_MS = 20_000;

interface ReadOut {
  extracted: ExtractedInvoice;
  format: string;
  rawText: string;
  ms: number;
}
interface CheckOut {
  invoiceId: string;
  ruleTier: string;
  rules: RuleResult[];
  vendor: { name: string; bankLast4: string } | null;
  ms: number;
}
interface DecideOut {
  invoiceId: string;
  ruleTier: string;
  finalTier: string;
  status: string;
  review: ClaudeCheck;
  receiptSeq: number | null;
  ms: number;
}

async function call<T>(url: string, payload: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: ctrl.signal });
    const b = (await res.json().catch(() => ({ ok: false, error: `The server answered ${res.status}` }))) as { ok: boolean; result?: T; error?: string };
    if (!b.ok || !b.result) throw new Error(b.error ?? "The server did not answer properly");
    return b.result;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("No answer in 20 seconds. Nothing was paid. Try again.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** The one sentence that says why: the strongest rule, else the strongest review flag. */
function headline(d: DecideOut, rules: RuleResult[]): string {
  if (d.finalTier === "AUTO") return "Everything matched the vendor record, the purchase order and the contract.";
  const order = { HOLD: 2, ASK: 1, AUTO: 0 } as Record<string, number>;
  const fired = rules.filter((r) => r.fired && r.id !== "autonomy").sort((a, b) => order[b.tier]! - order[a.tier]!);
  const flag = [...(d.review.flags ?? [])].sort((a, b) => order[b.severity]! - order[a.severity]!)[0];
  if (fired[0] && (!flag || order[fired[0].tier]! >= order[flag.severity]!)) return fired[0].reason;
  if (flag) return flag.reason.replace(/^Built-in check: /, "");
  return rules.find((r) => r.fired)?.reason ?? "A person should look at this one.";
}

function fileToBase64(f: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read that file"));
    r.readAsDataURL(f);
  });
}

export function Intake() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ name: string; b64: string; type: string; preview?: string } | null>(null);
  const [stage, setStage] = useState<Record<StageId, { state: StageState; ms?: number }>>({ read: { state: "waiting" }, check: { state: "waiting" }, decide: { state: "waiting" } });
  const [error, setError] = useState<{ stage: StageId; msg: string } | null>(null);
  const [read, setRead] = useState<ReadOut | null>(null);
  const [checked, setChecked] = useState<CheckOut | null>(null);
  const [decided, setDecided] = useState<DecideOut | null>(null);
  const [warm, setWarm] = useState<{ claude: { ok: boolean; ms: number; detail: string }; db: { ok: boolean; ms: number; detail: string } } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/intake/warm")
      .then((r) => r.json())
      .then((b: { ok: boolean; result?: typeof warm }) => b.ok && b.result && setWarm(b.result))
      .catch(() => undefined);
  }, []);

  const set = (id: StageId, state: StageState, ms?: number) => setStage((s) => ({ ...s, [id]: { state, ms } }));

  function reset() {
    setStage({ read: { state: "waiting" }, check: { state: "waiting" }, decide: { state: "waiting" } });
    setError(null);
    setRead(null);
    setChecked(null);
    setDecided(null);
  }

  /** Runs from `from` onward, reusing the results of stages that already finished. */
  async function run(from: StageId = "read") {
    setBusy(true);
    setError(null);
    let r = from === "read" ? null : read;
    let c = from === "decide" ? checked : null;
    try {
      if (!r) {
        setDecided(null);
        setChecked(null);
        set("read", "running");
        r = await call<ReadOut>(STAGES[0]!.url, file ? { file_base64: file.b64, media_type: file.type, text: text || undefined } : { text });
        setRead(r);
        set("read", "done", r.ms);
      }
      if (!c) {
        set("check", "running");
        try {
          c = await call<CheckOut>(STAGES[1]!.url, { extracted: r.extracted, rawText: r.rawText, format: r.format });
        } catch (e) {
          setError({ stage: "check", msg: (e as Error).message });
          set("check", "failed");
          return;
        }
        setChecked(c);
        set("check", "done", c.ms);
      }
      set("decide", "running");
      try {
        const d = await call<DecideOut>(STAGES[2]!.url, { invoiceId: c.invoiceId });
        setDecided(d);
        set("decide", "done", d.ms);
      } catch (e) {
        setError({ stage: "decide", msg: (e as Error).message });
        set("decide", "failed");
      }
    } catch (e) {
      setError({ stage: "read", msg: (e as Error).message });
      set("read", "failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadSample(s: Sample) {
    reset();
    if (s.kind === "text" && s.text) {
      setFile(null);
      setText(s.text());
    } else if (s.image) {
      const blob = await (await fetch(s.image)).blob();
      setText("");
      setFile({ name: s.image.split("/").pop()!, b64: await fileToBase64(blob), type: blob.type || "image/jpeg", preview: s.image });
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    reset();
    if (f.size > 4_000_000) {
      setError({ stage: "read", msg: "That file is too large. Keep it under 4 MB." });
      return;
    }
    setFile({ name: f.name, b64: await fileToBase64(f), type: f.type, preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined });
  }

  const tierField: Record<string, string> = { AUTO: "bg-yes text-white", ASK: "bg-ink text-paper", HOLD: "bg-tabled text-ink" };
  const verdict = decided
    ? decided.status === "paid"
      ? `Nod paid ${money(read?.extracted.amount_cents ?? 0)} to the account on file`
      : decided.finalTier === "HOLD"
        ? "Nod holds it until the vendor is called back"
        : "Nod asks a person before paying"
    : null;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section aria-labelledby="intake-h" className="bg-white p-6 sm:p-8 lg:col-span-7">
        <h1 id="intake-h" className="text-2xl font-bold">
          Hand Nod a vendor invoice
        </h1>
        <p className="mt-1 max-w-[65ch]">
          Paste the text of an invoice or an email, or attach a photo or PDF. Bring your own, or start from one of these.
        </p>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Sample invoices">
          {SAMPLES.map((s) => (
            <Button key={s.id} variant="outline" size="sm" onClick={() => loadSample(s)} disabled={busy}>
              {s.label}
            </Button>
          ))}
        </div>

        {file ? (
          <div className="mt-4 flex items-start gap-4 bg-paper-raised p-3">
            {file.preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file.preview} alt="The invoice photo Nod will read" className="h-40 w-auto" />
            )}
            <div className="text-sm">
              <p className="font-bold">{file.name}</p>
              <p className="text-ink-soft">Claude reads this file directly.</p>
              <button type="button" className="mt-2 underline" onClick={() => setFile(null)} disabled={busy}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <>
            <label htmlFor="invoice-text" className="sr-only">
              Invoice text
            </label>
            <textarea
              id="invoice-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              className="mt-4 w-full border border-rule bg-paper-raised p-3 text-sm leading-relaxed"
              placeholder="Paste an invoice or a vendor email here"
              disabled={busy}
            />
          </>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={() => run("read")} disabled={busy || (!text.trim() && !file)}>
            {busy ? "Working..." : "Send to Nod"}
          </Button>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button variant="outline" size="lg" onClick={() => fileInput.current?.click()} disabled={busy}>
            Attach a photo or PDF
          </Button>
        </div>
        <p className="mt-4 text-sm text-ink-soft" aria-live="polite">
          {warm
            ? `${warm.claude.ok ? `Claude ready (${warm.claude.ms} ms)` : `Claude unavailable: ${warm.claude.detail}`}. ${warm.db.ok ? `Books connected (${warm.db.ms} ms)` : `Books unavailable: ${warm.db.detail}`}.`
            : "Checking that Claude and the books are reachable..."}
        </p>
      </section>

      <section aria-labelledby="progress-h" className="space-y-6 lg:col-span-5">
        <div className="bg-paper-raised p-5">
          <h2 id="progress-h" className="text-lg font-bold">
            What Nod is doing
          </h2>
          <ol className="mt-3 space-y-2">
            {STAGES.map((s) => {
              const st = stage[s.id];
              return (
                <li key={s.id} className="flex items-baseline justify-between gap-3">
                  <span className={cn(st.state === "running" && "font-bold", st.state === "waiting" && "text-ink-soft", st.state === "failed" && "font-bold text-no")}>
                    {s.label}
                    {st.state === "running" ? "..." : ""}
                  </span>
                  <span className="text-sm tabular-nums text-ink-soft">
                    {st.state === "done" ? `${((st.ms ?? 0) / 1000).toFixed(1)} s` : st.state === "failed" ? "failed" : st.state === "running" ? "working" : ""}
                  </span>
                </li>
              );
            })}
          </ol>
          {error && (
            <div role="alert" className="mt-4 bg-no p-3 text-sm text-white">
              <p className="font-bold">{error.msg}</p>
              <div className="mt-2 flex gap-3">
                <button type="button" className="font-bold underline" onClick={() => run(error.stage)} disabled={busy}>
                  Retry {STAGES.find((s) => s.id === error.stage)!.label.toLowerCase()}
                </button>
                <button type="button" className="underline" onClick={reset} disabled={busy}>
                  Start over
                </button>
              </div>
            </div>
          )}
        </div>

        {read && (
          <div className="bg-white p-5">
            <h2 className="text-lg font-bold">What Claude read</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-ink-soft">Vendor</dt>
              <dd className="font-bold">{read.extracted.vendor_name || "-"}</dd>
              <dt className="text-ink-soft">Invoice</dt>
              <dd>{read.extracted.invoice_number || "-"}</dd>
              <dt className="text-ink-soft">Amount</dt>
              <dd className="font-bold tabular-nums">{money(read.extracted.amount_cents)}</dd>
              <dt className="text-ink-soft">Due</dt>
              <dd>{read.extracted.due_date ?? "-"}</dd>
              <dt className="text-ink-soft">Pay into</dt>
              <dd className={cn("tabular-nums", checked?.vendor && read.extracted.remit_bank_last4 && read.extracted.remit_bank_last4 !== checked.vendor.bankLast4 && "font-bold text-no")}>
                {read.extracted.remit_bank_last4 ? `account ending ${read.extracted.remit_bank_last4}` : "not stated"}
              </dd>
              {checked && (
                <>
                  <dt className="text-ink-soft">On file</dt>
                  <dd className="tabular-nums">{checked.vendor ? `${checked.vendor.name}, ending ${checked.vendor.bankLast4} (SEEDED vendor)` : "Not a known vendor"}</dd>
                </>
              )}
            </dl>
          </div>
        )}

        {decided && checked && (
          <div aria-live="polite">
            <div className={cn("p-5", tierField[decided.finalTier])}>
              <p className="text-xl font-bold">{verdict}.</p>
              <p className="mt-2">{headline(decided, checked.rules)}</p>
            </div>
            <div className="bg-white p-5">
              <h2 className="text-lg font-bold">Claude&apos;s explanation</h2>
              <p className="mt-2">{decided.review.explanation}</p>
              <p className="mt-2 text-sm text-ink-soft">
                Rules said {decided.ruleTier}; final tier {decided.finalTier}. Claude can raise a tier, never lower it. {STATUS_WORDS[decided.status] ?? decided.status}.
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm font-bold">
                <Link href={`/invoice?id=${decided.invoiceId}`} className="underline">
                  Open the full record
                </Link>
                {decided.status === "awaiting_approval" && (
                  <Link href="/approve" className="underline">
                    Go to the approver
                  </Link>
                )}
                {decided.receiptSeq !== null && <span>Receipt {decided.receiptSeq} written</span>}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
