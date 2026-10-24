import type { ApprovalDecision, Tier } from "@/lib/domain/types";

export const ACCEPT_AT = 0.85;
export const AMBIGUOUS_AT = 0.5;
export const MAX_ATTEMPTS = 2;

/** Confirm window per attempt. A re-confirm gets a longer window so a slow signal has room. */
export const CONFIRM_WINDOWS_MS: readonly number[] = [4000, 8000];

export function confirmWindowFor(attempt: number): number {
  return CONFIRM_WINDOWS_MS[Math.min(attempt, CONFIRM_WINDOWS_MS.length) - 1] ?? CONFIRM_WINDOWS_MS[0]!;
}

export interface ProtocolInput {
  /** 1-based attempt number. */
  attempt: number;
  /** Classifier p(approve), or null when the window timed out with no usable signal. */
  confidence: number | null;
  tier: Tier;
}

export interface ProtocolOutcome {
  decision: ApprovalDecision;
  /** What happens to the invoice after this attempt. */
  next: "pay" | "controller" | "reconfirm" | "stop";
  next_window_ms: number | null;
  reason: string;
}

/**
 * The approval protocol. Default to no: a timeout, a low score, a malformed score, or a second
 * ambiguous score all end in "stop". An accepted HOLD still goes to the controller.
 */
export function decideApproval({ attempt, confidence, tier }: ProtocolInput): ProtocolOutcome {
  const p = confidence;
  if (p === null || !Number.isFinite(p) || p < 0 || p > 1) {
    return { decision: "denied", next: "stop", next_window_ms: null, reason: "No usable signal in the window. Treated as no." };
  }
  if (p >= ACCEPT_AT) {
    return {
      decision: "accepted",
      next: tier === "HOLD" ? "controller" : "pay",
      next_window_ms: null,
      reason:
        tier === "HOLD"
          ? `Confidence ${p.toFixed(2)} is a clear yes. HOLD still needs the controller callback.`
          : `Confidence ${p.toFixed(2)} is a clear yes.`,
    };
  }
  if (p >= AMBIGUOUS_AT) {
    if (attempt < MAX_ATTEMPTS) {
      return {
        decision: "reconfirm",
        next: "reconfirm",
        next_window_ms: confirmWindowFor(attempt + 1),
        reason: `Confidence ${p.toFixed(2)} is ambiguous. Asking again with a longer window.`,
      };
    }
    return {
      decision: "denied",
      next: "stop",
      next_window_ms: null,
      reason: `Still ambiguous (${p.toFixed(2)}) after ${attempt} attempts. Defaulting to no.`,
    };
  }
  return { decision: "denied", next: "stop", next_window_ms: null, reason: `Confidence ${p.toFixed(2)} reads as no.` };
}
