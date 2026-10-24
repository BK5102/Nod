export const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 ? 2 : 0, minimumFractionDigits: cents % 100 ? 2 : 0 })}`;

/**
 * Hours after noon on the evening of the cancellation, so tonight, tomorrow morning and tomorrow
 * afternoon share one axis. "6:40 PM" is 6.67, "6:45 AM" is 18.75, a 3:30 PM landing after a
 * morning departure is 27.5. Pass the departure to keep an arrival after it.
 */
export function clockHours(text: string, after?: number): number | null {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(text);
  if (!m) return null;
  const h = (Number(m[1]) % 12) + Number(m[2]) / 60;
  const pm = (m[3] ?? "").toUpperCase() === "PM";
  // Evening of day 0 is PM; mornings belong to the next day.
  let v = pm ? h : h + 12;
  if (/tomorrow/i.test(text) && pm) v += 24;
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

/** "Tomorrow 6:45 AM" -> "6:45 AM": the day is already clear from the deadline line beside it. */
export const timeOnly = (text: string) => text.replace(/^(tonight|tomorrow|today)\s+/i, "");
