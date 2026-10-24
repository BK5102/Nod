export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const rem = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars}.${rem}`;
}

/** "$389" for whole dollars, "$389.50" otherwise. Used in every reason and refusal string. */
export function dollars(cents: number): string {
  return cents % 100 === 0 ? formatCents(cents).slice(0, -3) : formatCents(cents);
}

export const MINUTE_MS = 60 * 1000;

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * MINUTE_MS).toISOString();
}
