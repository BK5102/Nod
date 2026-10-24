export { formatCents as money } from "@/spacetimedb/src/core/money";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Jun 22" or "Jun 22, 4:00 PM" from an ISO string, in UTC so simulated time reads the same everywhere. */
export function day(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function dayTime(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day(iso)}, ${((h + 11) % 12) + 1}:${m} ${h < 12 ? "AM" : "PM"}`;
}

export function longDate(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function parseJson<T>(s: string, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export const STATUS_WORDS: Record<string, string> = {
  reviewing: "Being checked",
  awaiting_approval: "Waiting for a yes",
  awaiting_controller: "Waiting on the callback",
  paying: "Sending to the bank",
  payment_pending: "Bank failed, will retry",
  paid: "Paid",
  held: "Held",
  rejected: "Refused",
  canary_caught: "Attention check passed",
  canary_missed: "Attention check missed",
};

/** Voting-card stock: the only colours, and only on state. */
export function stateTone(status: string): "yes" | "no" | "tabled" | "neutral" {
  if (status === "paid" || status === "canary_caught") return "yes";
  if (status === "rejected" || status === "canary_missed") return "no";
  if (status === "held" || status === "awaiting_controller" || status === "payment_pending") return "tabled";
  return "neutral";
}

export const TIER_WORDS: Record<string, string> = { AUTO: "Pay", ASK: "Ask a person", HOLD: "Hold and verify" };
