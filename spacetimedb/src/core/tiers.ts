import type { ClaudeFlag, Tier } from "./types";

const RANK: Record<Tier, number> = { AUTO: 0, ASK: 1, HOLD: 2 };

export function tierRank(t: Tier): number {
  return RANK[t];
}

export function maxTier(...tiers: Tier[]): Tier {
  return tiers.reduce<Tier>((acc, t) => (RANK[t] > RANK[acc] ? t : acc), "AUTO");
}

/**
 * Merge Claude's flags into the rule tier. The result is never lower than the rule tier:
 * Claude can escalate a payment, never lower it. Unknown severities are treated as ASK.
 */
export function mergeClaudeFlags(ruleTier: Tier, flags: readonly ClaudeFlag[]): Tier {
  const flagTiers = flags.map((f) => (f.severity === "HOLD" ? "HOLD" : "ASK") as Tier);
  return maxTier(ruleTier, ...flagTiers);
}
