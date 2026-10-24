import "server-only";
import fixture from "@/data/fixtures/demo.json";
import { askJson, untrusted } from "@/lib/claude/client";
import { AGENT_SYSTEM, AgentAnswer } from "@/lib/claude/prompts";
import { connection } from "@/lib/stdb/server";
import { waitFor } from "@/lib/stdb/node";
import { dollars } from "@/spacetimedb/src/core/money";
import { deadlineLabel } from "@/spacetimedb/src/core/policy";

/** One offer from the replayed fixture (SIMULATED provider data). */
interface FixtureOffer {
  offerId: string;
  kind: string;
  merchant: string;
  title: string;
  departs: string;
  arrives: string;
  meetsDeadline: boolean;
  priceCents: number;
  refundable: boolean;
  category: string;
  mcc: string;
  listingText: string;
}

const OFFERS = fixture.offers as FixtureOffer[];
const PACE_MS = 300;
const pause = () => new Promise((r) => setTimeout(r, PACE_MS));

/**
 * Claude's input: route, deadline, card rules and offers. Built from public data only, so no name,
 * email, booking reference, loyalty number or card data can reach the model.
 */
export function buildClaudeInput(trip: { route: string; deadlineText: string }, mandateSummary: string): string {
  const lines = OFFERS.map((o) =>
    [
      `offerId: ${o.offerId}`,
      `kind: ${o.kind}`,
      `merchant: ${o.merchant}`,
      `title: ${o.title}`,
      o.departs ? `departs: ${o.departs}` : "",
      o.arrives ? `arrives: ${o.arrives}` : "",
      `meets deadline: ${o.meetsDeadline ? "yes" : "no"}`,
      `price: ${dollars(o.priceCents)}`,
      untrusted("listing", o.listingText),
    ]
      .filter(Boolean)
      .join("\n")
  );
  return `Trip: ${trip.route}. The flight was canceled. Deadline: ${trip.deadlineText}.\nCard rules: ${mandateSummary}\n\nOffers:\n\n${lines.join("\n\n")}`;
}

export interface RunResult {
  ms: number;
  claudeOk: boolean;
  claudeError: string | null;
  flagged: string[];
  options: number;
  setAside: number;
}

/**
 * The agent's run after a cancellation. Writes its steps as rows (streamed to the traveler), asks
 * Claude once for reasons and flags, and hands the offers to the database, which sets tier and rank.
 */
export async function runAgent(tripId: string): Promise<RunResult> {
  const start = Date.now();
  const agent = await connection("agent");
  const trip = agent.db.trip.tripId.find(tripId);
  const mandate = agent.db.mandate.tripId.find(tripId);
  if (!trip || !mandate) throw new Error("The demo is not seeded. Reset it first.");
  const step = async (kind: string, text: string) => {
    await agent.reducers.logStep({ tripId, kind, text });
    await pause();
  };

  const free = OFFERS.find((o) => o.kind === "free_rebooking");
  const paidFlights = OFFERS.filter((o) => o.kind === "flight").length;
  const hotels = OFFERS.filter((o) => o.kind === "hotel").length;
  const deadline = deadlineLabel(trip.deadlineText);

  if (free) {
    await step("search", `Checking ${free.merchant}'s free rebooking`);
    await step(
      "decision",
      `Free rebooking: departs ${free.departs.toLowerCase()}, lands ${free.arrives.toLowerCase()}. ${free.meetsDeadline ? `Makes your ${deadline} deadline.` : `Misses your ${deadline} deadline.`}`
    );
  }
  await step("search", `Searched ${paidFlights} paid flights and ${hotels} hotels`);
  await step("info", "Checking listings and writing a reason for each option");

  let answer: AgentAnswer = { reasons: [], flags: [] };
  let claudeError: string | null = null;
  try {
    answer = await askJson({
      schema: AgentAnswer,
      system: AGENT_SYSTEM,
      content: [{ type: "text", text: buildClaudeInput(trip, mandate.summary) }],
      effort: "low",
      max_tokens: 2000,
      budgetMs: 25_000,
    });
  } catch (e) {
    claudeError = (e as Error).message;
    await step("error", `Claude could not write reasons (${claudeError}). The card's rules still apply, and nothing is bought without your yes.`);
  }

  const known = new Set(OFFERS.map((o) => o.offerId));
  const reasonOf = new Map(answer.reasons.filter((r) => known.has(r.offerId)).map((r) => [r.offerId, r.reason]));
  const submitted = OFFERS.map(({ listingText: _listing, ...o }) => ({ ...o, claudeReason: reasonOf.get(o.offerId) ?? "" }));
  await agent.reducers.submitOffers({ tripId, offersJson: JSON.stringify(submitted) });

  const flags = answer.flags.filter((f) => known.has(f.offerId));
  for (const f of flags) {
    await agent.reducers.flagOffer({ offerId: f.offerId, severity: f.severity, reason: f.reason });
    const merchant = OFFERS.find((o) => o.offerId === f.offerId)?.merchant ?? f.offerId;
    await step(f.severity === "BLOCK" ? "refusal" : "decision", `Flagged ${merchant}: ${f.reason}`);
  }

  const rows = await waitFor(() => {
    const r = [...agent.db.offer.iter()].filter((o) => o.tripId === tripId);
    return r.length === OFFERS.length && flags.every((f) => r.find((o) => o.offerId === f.offerId)?.flagged) ? r : null;
  }, "offers to appear");
  const setAside = rows.filter((o) => o.status === "set_aside").length;
  const options = rows.length - setAside;
  await agent.reducers.logStep({ tripId, kind: "decision", text: `${options} options ready, ${setAside} set aside` });

  return { ms: Date.now() - start, claudeOk: !claudeError, claudeError, flagged: flags.map((f) => f.offerId), options, setAside };
}
