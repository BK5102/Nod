export const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 ? 2 : 0, minimumFractionDigits: cents % 100 ? 2 : 0 })}`;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Which day a time label is on, counted from today on the Pacific date (the stranded traveler is at
 * SFO): "Today" and "Tonight" are 0, "Tomorrow" is 1, a date such as "Mon Oct 26" counts the days.
 * Null when the label names no day.
 */
function dayOf(text: string): number | null {
  if (/^\s*(today|tonight)\b/i.test(text)) return 0;
  if (/^\s*tomorrow\b/i.test(text)) return 1;
  const d = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2})\b/i.exec(text);
  if (!d) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  const [y, mo, da] = today.split("-").map(Number) as [number, number, number];
  const base = Date.UTC(y, mo - 1, da);
  let t = Date.UTC(y, MONTHS.indexOf(d[1]!.toLowerCase()), Number(d[2]));
  if (t < base - 180 * 86_400_000) t = Date.UTC(y + 1, MONTHS.indexOf(d[1]!.toLowerCase()), Number(d[2]));
  return Math.round((t - base) / 86_400_000);
}

/**
 * Hours after noon today (Pacific date), so this afternoon, tonight, tomorrow morning and tomorrow
 * afternoon share one axis. "Tonight 6:40 PM" is 6.67, "Tomorrow 6:45 AM" is 18.75, "Today 11:45 AM"
 * is -0.25. Live flights carry a day label; a label without one is read as tonight (PM) or tomorrow
 * morning (AM). Pass the departure to keep an arrival after it.
 */
export function clockHours(text: string, after?: number): number | null {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(text);
  if (!m) return null;
  const h24 = (Number(m[1]) % 12) + ((m[3] ?? "").toUpperCase() === "PM" ? 12 : 0) + Number(m[2]) / 60;
  const day = dayOf(text);
  let v = day !== null ? h24 - 12 + 24 * day : h24 >= 12 ? h24 - 12 : h24 + 12;
  if (after !== undefined) while (v < after) v += 24;
  return v;
}

export const DEADLINE_H = 21; // 9:00 AM tomorrow on the clockHours axis

/** "2 h 15 min before 9:00 AM" or "6 h 30 min after 9:00 AM". */
export function deadlineDelta(arrivesH: number): { before: boolean; text: string } {
  const diff = Math.round((DEADLINE_H - arrivesH) * 60);
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 60);
  const min = abs % 60;
  const span = [h ? `${h} h` : "", min ? `${min} min` : ""].filter(Boolean).join(" ") || "0 min";
  return { before: diff >= 0, text: `${span} ${diff >= 0 ? "before" : "after"} 9:00 AM` };
}

export function elapsed(fromIso: string, toMs: number): string {
  const s = Math.max(0, Math.floor((toMs - Date.parse(fromIso)) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function clockOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

/** "Tomorrow 6:45 AM" -> "6:45 AM". A dated label such as "Mon Oct 26 7:00 AM" keeps its date. */
export const timeOnly = (text: string) => text.replace(/^(tonight|tomorrow|today)\s+/i, "");

/** "Today 1:43 PM to 10:29 PM": the day is named once, only when it is today (tonight and tomorrow read from the deadline). */
export const timeSpan = (departs: string, arrives: string) => `${/^\s*today\b/i.test(departs) ? "Today " : ""}${timeOnly(departs)} to ${timeOnly(arrives)}`;

/** "10 h 31 min early" -> "10 h early" past two hours: the minutes stop mattering. */
export const roughly = (text: string) => text.replace(/^(\d+) h \d+ min/, (m, h) => (Number(h) >= 2 ? `${h} h` : m));
