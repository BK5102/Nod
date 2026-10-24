import type { AutonomyState } from "@/lib/domain/types";

/**
 * The earned-autonomy ladder. Rung 0: every payment needs a person.
 * A rung is earned by a streak of clean outcomes: payments Nod would have auto-paid at the next
 * rung, which a person then approved. One overturned payment resets the streak and drops a rung.
 * HOLD cases never auto-pay at any rung; that is enforced by the tier, not here.
 */
export const LADDER: readonly { ceiling_cents: number; streak_needed: number }[] = [
  { ceiling_cents: 0, streak_needed: 0 },
  { ceiling_cents: 50_000, streak_needed: 5 }, // $500
  { ceiling_cents: 150_000, streak_needed: 12 }, // $1,500
  { ceiling_cents: 500_000, streak_needed: 25 }, // $5,000
];

export function initialAutonomy(now: string): AutonomyState {
  return { clean_streak: 0, rung: 0, auto_pay_ceiling_cents: 0, updated_at: now };
}

export type AutonomyEvent = "clean_approval" | "overturned";

export function applyAutonomyEvent(state: AutonomyState, event: AutonomyEvent, now: string): AutonomyState {
  if (event === "overturned") {
    const rung = Math.max(0, state.rung - 1);
    return { clean_streak: 0, rung, auto_pay_ceiling_cents: LADDER[rung]!.ceiling_cents, updated_at: now };
  }
  const streak = state.clean_streak + 1;
  let rung = state.rung;
  const next = LADDER[rung + 1];
  if (next && streak >= next.streak_needed) rung += 1;
  return { clean_streak: streak, rung, auto_pay_ceiling_cents: LADDER[rung]!.ceiling_cents, updated_at: now };
}

/** Clean outcomes still needed for the next rung, or null at the top. */
export function streakToNextRung(state: AutonomyState): number | null {
  const next = LADDER[state.rung + 1];
  return next ? Math.max(0, next.streak_needed - state.clean_streak) : null;
}
