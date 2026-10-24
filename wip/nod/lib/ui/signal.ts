import { generateSignal } from "@/spacetimedb/src/core/classifier";

/** Stable seed per invoice and attempt, so the same demo plays the same way twice. */
export function seedFor(invoiceId: string, attempt: number): number {
  let h = 2166136261;
  for (let i = 0; i < invoiceId.length; i++) h = Math.imul(h ^ invoiceId.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100_000) * 10 + attempt;
}

/** The two traces a window can produce from one seed: the same noise, with or without the yes bump. */
export function tracesFor(invoiceId: string, attempt: number, noise: number, fatigue: number) {
  const seed = seedFor(invoiceId, attempt);
  return {
    yes: generateSignal({ intent: "approve", noise, fatigue, duration_s: 3, seed }),
    no: generateSignal({ intent: "reject", noise, fatigue, duration_s: 3, seed }),
  };
}
