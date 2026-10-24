import type { Receipt } from "@/src/module_bindings/types";
import type { Infer } from "spacetimedb";
import { dayTime, money, parseJson } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

type ReceiptRow = Infer<typeof Receipt>;

const DECISION_WORDS: Record<string, string> = {
  paid: "Paid",
  held: "Held",
  rejected: "Refused",
  canary_caught: "Attention check passed",
  canary_missed: "Attention check missed",
};

const TONE: Record<string, string> = {
  paid: "bg-yes text-white",
  canary_caught: "bg-yes text-white",
  held: "bg-tabled text-ink",
  rejected: "bg-no text-white",
  canary_missed: "bg-no text-white",
};

/** One numbered entry in the minute book: what was decided, by whom, on what evidence, and how sure the yes was. */
export function ReceiptEntry({ receipt: r }: { receipt: ReceiptRow }) {
  const actors = parseJson<string[]>(r.actorIdsJson, []);
  const rules = parseJson<{ id: string; reason: string; tier: string }[]>(r.rulesJson, []);
  return (
    <section aria-label={`Receipt ${r.seq}`} className="bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">Receipt {r.seq}</h2>
        <span className={cn("px-2 py-0.5 text-sm font-bold", TONE[r.decision] ?? "bg-paper-raised")}>{DECISION_WORDS[r.decision] ?? r.decision}</span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {dayTime(r.asOf)}, {r.vendorName}, {money(r.amountCents)}, tier {r.tier}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-ink-soft">Signal confidence</dt>
          <dd className="font-bold tabular-nums">{r.signalConfidence < 0 ? "None needed" : r.signalConfidence.toFixed(3)}</dd>
        </div>
        <div>
          <dt className="text-ink-soft">People and agent</dt>
          <dd className="font-bold">{actors.map((a) => a.replace("act_", "")).join(", ")}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm">{r.note}</p>
      {rules.length > 0 && <p className="mt-2 text-sm text-ink-soft">Rules: {rules.map((x) => x.id).join(", ")}</p>}
      <p className="mt-3 text-xs text-ink-soft break-all">
        Hash {r.hash.slice(0, 16)}... chained to {r.prevHash.slice(0, 16)}...
      </p>
    </section>
  );
}
