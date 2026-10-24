// Shared types for the Rerouted policy core. Pure data, no SpacetimeDB imports, so the module and
// the Vitest suite run the same code.

export type Tier = "AUTO" | "ASK" | "BLOCK";

export type OfferKind = "free_rebooking" | "flight" | "hotel";

/** One rule that fired on an offer, with the plain reason shown to the traveler. */
export interface RuleHit {
  id: string;
  tier: Tier;
  reason: string;
}

/** A flag from Claude. It can only raise an offer's tier. */
export interface Flag {
  severity: "ASK" | "BLOCK";
  reason: string;
}

/** An offer as the agent submits it. Tier, rank, quote hash and expiry are set by the reducer. */
export interface OfferInput {
  offerId: string;
  kind: OfferKind;
  merchant: string;
  title: string;
  departs: string;
  arrives: string;
  meetsDeadline: boolean;
  priceCents: number;
  refundable: boolean;
  category: string;
  mcc: string;
}

/** The card's rules for this trip. */
export interface MandateRules {
  tripCapCents: number;
  askAboveCents: number;
  autoCeilingCents: number;
  categories: string[];
}

/** What the rules need to know about the trip and the other offers. */
export interface OfferContext {
  spendCents: number;
  /** The airline's free rebooking, if one was offered. */
  freeOption: { merchant: string; meetsDeadline: boolean } | null;
  /** Short deadline label, for example "9:00 AM". */
  deadlineLabel: string;
}

export interface Evaluation {
  tier: Tier;
  rules: RuleHit[];
}
