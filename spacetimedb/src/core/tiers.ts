import type { Flag, Tier } from "./types";

const RANK: Record<Tier, number> = { AUTO: 0, ASK: 1, BLOCK: 2 };

export function tierRank(t: Tier): number {
  return RANK[t];
}

export function maxTier(...tiers: Tier[]): Tier {
  return tiers.reduce<Tier>((acc, t) => (RANK[t] > RANK[acc] ? t : acc), "AUTO");
}

/**
 * Merge Claude's flags into the rule tier. The result is never lower than the rule tier:
 * Claude can make an offer stricter, never looser. Unknown severities are treated as ASK.
 */
export function mergeFlags(ruleTier: Tier, flags: readonly Flag[]): Tier {
  const flagTiers = flags.map((f) => (f.severity === "BLOCK" ? "BLOCK" : "ASK") as Tier);
  return maxTier(ruleTier, ...flagTiers);
}
