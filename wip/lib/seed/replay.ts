import type { AnswerKeyRow, JournalEntry } from "@/lib/domain/types";
import { MockBank } from "@/lib/bank/mock";
import { heuristicCheck } from "@/lib/claude/check";
import { closePeriod, controllerDecision, ingestInvoice, recordApproval, sweepStalls } from "@/lib/agent/pipeline";
import { openingEntry } from "@/lib/ledger/ledger";
import { initialAutonomy } from "@/lib/policy/autonomy";
import { Tx } from "@/lib/store/tx";
import { emptyWorld, newId, type World } from "@/lib/store/world";
import { ACTORS, COMPANY, CONTRACTS, PURCHASE_ORDERS, VENDORS } from "./company";
import { answerKey, INVOICE_SPECS, materialize, PERIOD_CLOSES, type InvoiceSpec } from "./scenario";

type Event =
  | { at: string; kind: "invoice"; spec: InvoiceSpec }
  | { at: string; kind: "approve"; spec: InvoiceSpec; attempt: number }
  | { at: string; kind: "controller"; spec: InvoiceSpec }
  | { at: string; kind: "close"; period: string }
  | { at: string; kind: "tick" };

const iso = (date: string, hour: number) => `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`;
const plusDays = (date: string, n: number) => {
  const t = new Date(`${date}T12:00:00.000Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

function timeline(until: string): Event[] {
  const ev: Event[] = [];
  for (const s of INVOICE_SPECS) {
    ev.push({ at: iso(s.date, s.hour ?? 9), kind: "invoice", spec: s });
    if (s.approver) {
      s.approver.confidences.forEach((_, i) =>
        ev.push({ at: iso(plusDays(s.date, s.approver!.after_days), 14 + i), kind: "approve", spec: s, attempt: i }),
      );
      if (s.controller) ev.push({ at: iso(plusDays(s.date, s.approver.after_days + s.controller.after_days), 11), kind: "controller", spec: s });
    }
  }
  for (const c of PERIOD_CLOSES) ev.push({ at: iso(c.date, 17), kind: "close", period: c.period });
  // A daily tick so stalled approvals get nudged and escalated on schedule.
  for (let d = "2026-01-02"; iso(d, 8) <= until; d = plusDays(d, 1)) ev.push({ at: iso(d, 8), kind: "tick" });
  return ev.filter((e) => e.at <= until).sort((a, b) => a.at.localeCompare(b.at));
}

/** The company at the start of the year, before any invoice. */
export function baseWorld(): World {
  const w = emptyWorld(COMPANY.history_start);
  w.actors = structuredClone(ACTORS);
  w.vendors = structuredClone(VENDORS);
  w.contracts = structuredClone(CONTRACTS);
  w.purchase_orders = structuredClone(PURCHASE_ORDERS);
  w.autonomy_state = initialAutonomy(COMPANY.history_start);
  w.sim_state = { as_of: COMPANY.history_start, opening_balance_cents: COMPANY.opening_balance_cents, closed_through: null, bank_outage: false };
  w.journal_entries.push({ id: "je_opening", ...openingEntry(COMPANY.opening_balance_cents, "2026-01-01T00:00:00.000Z") } as JournalEntry);
  return w;
}

/**
 * Replays six months of history through the real pipeline (same policy engine, same approval
 * protocol, same ledger and receipts) up to `until`. The second reviewer is the deterministic
 * heuristic here so seeding is reproducible and costs nothing.
 */
export async function buildWorld(until: string = COMPANY.demo_as_of): Promise<{ world: World; answerKey: AnswerKeyRow[] }> {
  const tx = new Tx(baseWorld());
  const bank = new MockBank(() => tx.w.sim_state.bank_outage);
  const deps = { checker: async (i: Parameters<typeof heuristicCheck>[0]) => heuristicCheck(i), bank };

  for (const e of timeline(until)) {
    if (e.at > tx.w.sim_state.as_of) tx.setSim({ ...tx.w.sim_state, as_of: e.at });
    if (e.kind === "tick") {
      sweepStalls(tx);
    } else if (e.kind === "invoice") {
      const { extracted, raw_text } = materialize(e.spec);
      await ingestInvoice(
        tx,
        {
          id: e.spec.id,
          extracted,
          raw_text,
          source_format: e.spec.format,
          file_path: e.spec.format === "pdf" || e.spec.format === "image" ? `/invoices/${e.spec.id}.${e.spec.format === "pdf" ? "pdf" : "png"}` : null,
          extraction_method: "seed",
          is_canary: e.spec.is_canary,
          handoff: e.spec.handoff ? { from: e.spec.handoff.from, note: e.spec.handoff.note, missing: e.spec.handoff.missing } : null,
        },
        deps,
      );
    } else if (e.kind === "approve") {
      const inv = tx.w.invoices.find((i) => i.id === e.spec.id);
      if (!inv || inv.status !== "awaiting_approval") continue; // auto-paid once autonomy was earned, or already decided
      const a = e.spec.approver!;
      await recordApproval(tx, {
        invoice_id: inv.id,
        actor_id: a.actor_id ?? inv.assigned_approver_id ?? "act_maya",
        confidence: a.confidences[e.attempt]!,
        latency_ms: a.latency_ms ?? 4000,
        bank,
      });
    } else if (e.kind === "controller") {
      const inv = tx.w.invoices.find((i) => i.id === e.spec.id);
      if (!inv || inv.status !== "awaiting_controller") continue;
      await controllerDecision(tx, { invoice_id: inv.id, actor_id: "act_luis", outcome: e.spec.controller!.outcome, note: e.spec.controller!.note, bank });
    } else {
      if (!tx.w.sim_state.closed_through || e.period > tx.w.sim_state.closed_through) closePeriod(tx, { actor_id: "act_luis", period: e.period });
    }
  }
  if (until > tx.w.sim_state.as_of) tx.setSim({ ...tx.w.sim_state, as_of: until });
  return { world: tx.w, answerKey: answerKey() };
}

export { newId };
