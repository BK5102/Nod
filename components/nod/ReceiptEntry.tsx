"use client";

import type { Receipt } from "@/src/module_bindings/types";
import type { Infer } from "spacetimedb";
import { useTable } from "spacetimedb/react";
import { tables } from "@/src/module_bindings";
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

const TIER_WORDS: Record<string, string> = { AUTO: "AUTO, pay", ASK: "ASK, a person decides", HOLD: "HOLD, verify by callback" };

/** One receipt: the decision, how reliable the approval was, who decided, the rules behind it, and its place in the chain. */
export function ReceiptEntry({ receipt: r }: { receipt: ReceiptRow }) {
  const [actors] = useTable(tables.actor);
  const ids = parseJson<string[]>(r.actorIdsJson, []);
  const names = ids.map((id) => actors.find((a) => a.actorId === id)?.name ?? id);
  const people = names.filter((_, i) => ids[i] !== "act_agent");
  const rules = parseJson<{ id: string; reason: string; tier: string }[]>(r.rulesJson, []);
  const reliability = r.signalConfidence < 0 ? null : r.signalConfidence;

  return (
    <section aria-label={`Receipt ${r.seq}`} className="bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">Receipt {r.seq}</h2>
        <span className="text-sm text-ink-soft">{dayTime(r.asOf)}</span>
      </div>
      <p className="mt-1">
        {r.vendorName}, <span className="font-bold tabular-nums">{money(r.amountCents)}</span>
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-ink-soft">Decision</dt>
          <dd className="mt-1">
            <span className={cn("px-2 py-0.5 font-bold", TONE[r.decision] ?? "bg-paper-raised")}>{DECISION_WORDS[r.decision] ?? r.decision}</span>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-soft">Approval reliability</dt>
          <dd className="mt-1 font-bold tabular-nums">
            {reliability === null ? "No approval needed" : `${reliability.toFixed(2)} ${reliability >= 0.85 ? "(clear)" : reliability >= 0.5 ? "(unclear)" : "(read as no)"}`}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-soft">Tier</dt>
          <dd className="mt-1 font-bold">{TIER_WORDS[r.tier] ?? r.tier}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-soft">Who approved</dt>
          <dd className="mt-1 font-bold">{people.length ? people.map((n) => n.split(",")[0]).join(", ") : "Nobody needed to: Nod, inside its limit"}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <h3 className="text-sm text-ink-soft">Rules that fired</h3>
        {rules.length === 0 ? (
          <p className="mt-1">None. Every check passed.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {rules.map((x) => (
              <li key={x.id}>
                <span className="font-bold">{x.id.replace("review:", "Claude: ").replace(/_/g, " ")}</span> ({x.tier}). {x.reason}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-3 text-sm">{r.note}</p>
      <p className="mt-3 text-xs break-all text-ink-soft">
        Hash {r.hash.slice(0, 20)}... sealed over the line before it, {r.prevHash.slice(0, 20)}... Change any field and every later receipt stops verifying.
      </p>
    </section>
  );
}
