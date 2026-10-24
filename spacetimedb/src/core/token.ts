import { dollars } from "./money";

/**
 * A mock card token, modeled on the spending controls Visa publicly describes for agent payments
 * (cap, merchant categories, expiry). Not a Visa API. It re-checks the purchase independently of the
 * mandate, so a bug in one check does not move money on its own.
 */
export interface MockToken {
  last4: string;
  capCents: number;
  allowedMccs: string[];
  expiresAt: string;
}

export type TokenCheck = { ok: true } | { ok: false; reason: string };

export function checkMockToken(token: MockToken, spentCents: number, amountCents: number, mcc: string, nowIso: string): TokenCheck {
  if (nowIso > token.expiresAt) return { ok: false, reason: `Refused: the card ending ${token.last4} has expired.` };
  if (!token.allowedMccs.includes(mcc)) return { ok: false, reason: `Refused: the card ending ${token.last4} does not allow this kind of merchant.` };
  if (spentCents + amountCents > token.capCents) {
    return { ok: false, reason: `Refused: the card ending ${token.last4} allows ${dollars(token.capCents)} for this trip.` };
  }
  return { ok: true };
}
