export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const rem = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars}.${rem}`;
}

/** Parses "$1,234.50", "1234.5", "USD 1,234" into cents. Returns null when no amount is present. */
export function parseMoneyToCents(input: string): number | null {
  const m = input.replace(/,/g, "").match(/-?\d+(?:\.\d{1,2})?/);
  if (!m) return null;
  return Math.round(parseFloat(m[0]) * 100);
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / DAY_MS;
}

export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
}
