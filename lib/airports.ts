// Major US airports the demo can pick a random real route between, with their time zones. Pure data
// and helpers, shared by the server (search windows) and the browser (the corridor's clock).

export const AIRPORTS: Record<string, string> = {
  SFO: "America/Los_Angeles",
  LAX: "America/Los_Angeles",
  SAN: "America/Los_Angeles",
  SEA: "America/Los_Angeles",
  LAS: "America/Los_Angeles",
  PHX: "America/Phoenix",
  DEN: "America/Denver",
  DFW: "America/Chicago",
  IAH: "America/Chicago",
  ORD: "America/Chicago",
  MSP: "America/Chicago",
  ATL: "America/New_York",
  MIA: "America/New_York",
  JFK: "America/New_York",
  BOS: "America/New_York",
  IAD: "America/New_York",
};

export const tzOf = (code: string) => AIRPORTS[code] ?? "America/Los_Angeles";

/** Minutes a time zone is ahead of UTC at a moment ("GMT-7" -> -420). */
function offsetMinutes(timeZone: string, at: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}

/** Hours the destination's clock is ahead of the origin's: SFO to JFK is 3, SFO to ORD is 2, JFK to SFO is -3. */
export function hoursAhead(from: string, to: string, at = new Date()): number {
  return (offsetMinutes(tzOf(to), at) - offsetMinutes(tzOf(from), at)) / 60;
}
