import { sha256Hex } from "./sha256";
import { dollars } from "./money";
import { maxTier } from "./tiers";
import type { Evaluation, MandateRules, OfferContext, OfferInput, RuleHit, Tier } from "./types";

const CATEGORY_LABEL: Record<string, string> = { airline: "an airline", lodging: "a hotel" };

function categoryList(categories: string[]): string {
  const labels = categories.map((c) => CATEGORY_LABEL[c] ?? c);
  return labels.length <= 1 ? (labels[0] ?? "an allowed category") : `${labels.slice(0, -1).join(", ")} or ${labels.at(-1)!.replace(/^an? /, "")}`;
}

/**
 * The card's rules, applied to one offer. Starts at AUTO and only rules can raise it. Claude never
 * calls this and never sets a tier; its flags are merged afterwards with mergeFlags.
 */
export function evaluateOffer(offer: OfferInput, mandate: MandateRules, ctx: OfferContext): Evaluation {
  const rules: RuleHit[] = [];
  const price = offer.priceCents;

  if (ctx.spendCents + price > mandate.tripCapCents) {
    rules.push({ id: "over_trip_cap", tier: "BLOCK", reason: `Over your ${dollars(mandate.tripCapCents)} trip cap.` });
  }
  if (!mandate.categories.includes(offer.category)) {
    rules.push({ id: "category_not_allowed", tier: "BLOCK", reason: `Not ${categoryList(mandate.categories)}.` });
  }
  if (price > mandate.askAboveCents) {
    rules.push({ id: "above_ask_threshold", tier: "ASK", reason: `Over ${dollars(mandate.askAboveCents)}, so you asked to approve it.` });
  }
  if (offer.kind === "flight" && price > 0 && ctx.freeOption) {
    const free = ctx.freeOption;
    const reason = free.meetsDeadline
      ? `${free.merchant} will rebook you free and still make your deadline; this costs ${dollars(price)}.`
      : offer.meetsDeadline
        ? `${free.merchant} will rebook you free; this costs ${dollars(price)} because the free option lands after ${ctx.deadlineLabel}.`
        : `${free.merchant} will rebook you free, and this option also lands after ${ctx.deadlineLabel}.`;
    rules.push({ id: "free_option_exists", tier: "ASK", reason });
  }
  if (!offer.meetsDeadline) {
    rules.push({ id: "misses_deadline", tier: "ASK", reason: `Lands after your ${ctx.deadlineLabel} deadline.` });
  }
  if (price > mandate.autoCeilingCents) {
    rules.push({ id: "above_auto_ceiling", tier: "ASK", reason: `Over your auto-buy limit of ${dollars(mandate.autoCeilingCents)}.` });
  }

  const tier: Tier = maxTier(...rules.map((r) => r.tier));
  return { tier, rules };
}

export interface RankInput {
  offerId: string;
  kind: string;
  meetsDeadline: boolean;
  priceCents: number;
  tier: Tier;
}

/**
 * Deterministic ranking, done by the reducer, never by Claude. BLOCK offers are set aside (rank 0).
 * Flights before hotels; within each, offers that meet the deadline first, then cheaper first.
 */
export function rankOffers(offers: readonly RankInput[]): Map<string, number> {
  const ranks = new Map<string, number>();
  const live = offers.filter((o) => o.tier !== "BLOCK");
  for (const o of offers) if (o.tier === "BLOCK") ranks.set(o.offerId, 0);
  const group = (o: RankInput) => (o.kind === "hotel" ? 1 : 0);
  live
    .slice()
    .sort(
      (a, b) =>
        group(a) - group(b) ||
        Number(b.meetsDeadline) - Number(a.meetsDeadline) ||
        a.priceCents - b.priceCents ||
        a.offerId.localeCompare(b.offerId)
    )
    .forEach((o, i) => ranks.set(o.offerId, i + 1));
  return ranks;
}

/** The exact quote a traveler approves. Any change to merchant, price or expiry changes the hash. */
export function quoteHash(q: { offerId: string; merchant: string; priceCents: number; expiresAt: string }): string {
  return sha256Hex(`quote\n${q.offerId}\n${q.merchant}\n${q.priceCents}\n${q.expiresAt}`);
}

/** "Arrive JFK by 9:00 AM" -> "9:00 AM". Falls back to the whole text. */
export function deadlineLabel(deadlineText: string): string {
  return deadlineText.match(/by\s+(.+)$/i)?.[1] ?? deadlineText;
}
