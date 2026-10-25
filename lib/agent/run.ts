import "server-only";
import { askJson, untrusted } from "@/lib/claude/client";
import { AGENT_SYSTEM, AgentAnswer } from "@/lib/claude/prompts";
import { findOffers, searchRequestFor } from "@/lib/providers";
import type { ProviderOffer } from "@/lib/providers/types";
import { connection } from "@/lib/stdb/server";
import { waitFor } from "@/lib/stdb/node";
import { dollars } from "@/spacetimedb/src/core/money";
import { deadlineLabel } from "@/spacetimedb/src/core/policy";

const PACE_MS = 300;
const pause = () => new Promise((r) => setTimeout(r, PACE_MS));
/** "Tomorrow 7:05 AM" -> "tomorrow 7:05 AM" (keeps AM/PM in capitals). */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Claude's input: route, deadline, card rules and offers. Built from public data only, so no name,
 * email, booking reference, loyalty number or card data can reach the model.
 */
export function buildClaudeInput(trip: { route: string; deadlineText: string }, mandateSummary: string, offers: readonly ProviderOffer[]): string {
  const lines = offers.map((o) =>
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
  source: string;
  fallbackReason: string | null;
  claudeOk: boolean;
  claudeError: string | null;
  flagged: string[];
  options: number;
  setAside: number;
}

/**
 * The agent's run after a cancellation. Finds offers (live flight search or saved offers), writes its
 * steps as rows (streamed to the traveler), asks Claude once for reasons and flags, and hands the
 * offers to the database, which sets tier and rank.
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
  const deadline = deadlineLabel(trip.deadlineText);

  const airline = trip.flight.replace(/\s+\d+$/, "");
  await step("search", `Checking ${airline}'s free rebooking and searching flights ${trip.route}`);
  const found = await findOffers(searchRequestFor(trip.route, deadline));
  const offers = found.offers;
  if (found.fallbackReason) await step("error", `Live flight search unavailable (${found.fallbackReason}). Using saved demo offers instead.`);

  const freeOffer = offers.find((o) => o.kind === "free_rebooking");
  const paidFlights = offers.filter((o) => o.kind === "flight").length;
  const hotels = offers.filter((o) => o.kind === "hotel").length;
  if (freeOffer) {
    await step(
      "decision",
      `Free rebooking: departs ${lowerFirst(freeOffer.departs)}, lands ${lowerFirst(freeOffer.arrives)}. ${freeOffer.meetsDeadline ? `Makes your ${deadline} deadline.` : `Misses your ${deadline} deadline.`}`
    );
  }
  await step("search", `Found ${paidFlights} paid flights and ${hotels} hotels from ${found.source}`);
  await step("info", "Checking listings and writing a reason for each option");

  let answer: AgentAnswer = { reasons: [], flags: [] };
  let claudeError: string | null = null;
  try {
    answer = await askJson({
      schema: AgentAnswer,
      system: AGENT_SYSTEM,
      content: [{ type: "text", text: buildClaudeInput(trip, mandate.summary, offers) }],
      effort: "low",
      max_tokens: 2000,
      budgetMs: 25_000,
    });
  } catch (e) {
    claudeError = (e as Error).message;
    await step("error", `Claude could not write reasons (${claudeError}). The card's rules still apply, and nothing is bought without your yes.`);
  }

  const known = new Set(offers.map((o) => o.offerId));
  const reasonOf = new Map(answer.reasons.filter((r) => known.has(r.offerId)).map((r) => [r.offerId, r.reason]));
  const submitted = offers.map(({ listingText: _listing, ...o }) => ({ ...o, claudeReason: reasonOf.get(o.offerId) ?? "" }));
  await agent.reducers.submitOffers({ tripId, offersJson: JSON.stringify(submitted) });

  const flags = answer.flags.filter((f) => known.has(f.offerId));
  for (const f of flags) {
    await agent.reducers.flagOffer({ offerId: f.offerId, severity: f.severity, reason: f.reason });
    const merchant = offers.find((o) => o.offerId === f.offerId)?.merchant ?? f.offerId;
    await step(f.severity === "BLOCK" ? "refusal" : "decision", `Flagged ${merchant}: ${f.reason}`);
  }

  const rows = await waitFor(() => {
    const r = [...agent.db.offer.iter()].filter((o) => o.tripId === tripId);
    return r.length === offers.length && flags.every((f) => r.find((o) => o.offerId === f.offerId)?.flagged) ? r : null;
  }, "offers to appear");
  const setAside = rows.filter((o) => o.status === "set_aside").length;
  const options = rows.length - setAside;
  await agent.reducers.logStep({ tripId, kind: "decision", text: `${options} options ready, ${setAside} set aside` });

  return {
    ms: Date.now() - start,
    source: found.source,
    fallbackReason: found.fallbackReason,
    claudeOk: !claudeError,
    claudeError,
    flagged: flags.map((f) => f.offerId),
    options,
    setAside,
  };
}
