// The public tables from docs/PLAN.md section 9, as the frontend reads them.

export type TripStatus = "scheduled" | "canceled" | "options_ready" | "booked";
export type Tier = "AUTO" | "ASK" | "BLOCK";
export type OfferKind = "free_rebooking" | "flight" | "hotel";
export type StepKind = "info" | "search" | "decision" | "refusal" | "error";

export interface Trip {
  tripId: string;
  route: string;
  flight: string;
  departs: string;
  deadlineText: string;
  status: TripStatus;
  cancelReason: string;
  canceledAt: string;
  bookedAt: string;
  fareCents: number;
  refundOwedCents: number;
  spendCents: number;
}

export interface Mandate {
  tripId: string;
  tripCapCents: number;
  askAboveCents: number;
  autoCeilingCents: number;
  categories: string;
  summary: string;
}

export interface RuleHit {
  id: string;
  tier: Tier;
  reason: string;
}

export interface Offer {
  offerId: string;
  tripId: string;
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
  rank: number;
  tier: Tier;
  rulesJson: string;
  claudeReason: string;
  flagged: boolean;
  flagReason: string;
  quoteHash: string;
  expiresAt: string;
  status: "open" | "booked" | "set_aside";
}

export interface AgentStep {
  id: number;
  tripId: string;
  seq: number;
  kind: StepKind;
  text: string;
  at: string;
}

export interface Receipt {
  seq: number;
  tripId: string;
  action: string;
  offerId: string;
  merchant: string;
  amountCents: number;
  tier: Tier;
  rulesJson: string;
  actor: string;
  quoteHash: string;
  tokenLast4: string;
  at: string;
  prevHash: string;
  hash: string;
}

/** What every component reads. The mock and the live adapter both produce it. */
export interface RerouteState {
  trip: Trip | null;
  mandate: Mandate | null;
  offers: Offer[];
  steps: AgentStep[];
  receipts: Receipt[];
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface RerouteActions {
  reset(): Promise<ActionResult>;
  cancel(): Promise<ActionResult>;
  agentTryApprove(offerId: string): Promise<ActionResult>;
  setPrice(offerId: string, priceCents: number): Promise<ActionResult>;
  approve(offerId: string, quoteHash: string): Promise<ActionResult>;
}

export interface RerouteSource {
  state: RerouteState;
  actions: RerouteActions;
  mode: "mock" | "live";
  connected: boolean;
}

export function parseRules(json: string): RuleHit[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as RuleHit[]) : [];
  } catch {
    return [];
  }
}
