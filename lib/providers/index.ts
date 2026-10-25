import "server-only";
import fixture from "@/data/fixtures/demo.json";
import { duffelConfigured, searchDuffel } from "./duffel";
import type { ProviderOffer, SearchRequest, SearchResult } from "./types";

const FIXTURE = fixture.offers as ProviderOffer[];

/**
 * Where offers come from. FLIGHT_PROVIDER=duffel searches live flights (Duffel); anything else, or any
 * failure, uses the replayed fixture. The airline's free rebooking and the hotels always come from the
 * fixture (SIMULATED): free rebooking is offered by the airline, not a search API, and hotel search is
 * not wired. Offers keep the same shape either way, so the database contract never changes.
 */
export async function findOffers(req: SearchRequest): Promise<SearchResult> {
  if (process.env.FLIGHT_PROVIDER !== "duffel") {
    return { offers: FIXTURE, source: "saved demo offers (SIMULATED)", fallbackReason: null };
  }
  if (!duffelConfigured()) {
    return { offers: FIXTURE, source: "saved demo offers (SIMULATED)", fallbackReason: "DUFFEL_ACCESS_TOKEN is not set" };
  }
  try {
    const flights = await searchDuffel(req);
    if (flights.length === 0) throw new Error(`no USD flights from ${req.origin} to ${req.destination} tonight or tomorrow`);
    const keep = FIXTURE.filter((o) => o.kind !== "flight");
    return { offers: [...keep.filter((o) => o.kind === "free_rebooking"), ...flights, ...keep.filter((o) => o.kind === "hotel")], source: "live flight search (Duffel test mode)", fallbackReason: null };
  } catch (e) {
    return { offers: FIXTURE, source: "saved demo offers (SIMULATED)", fallbackReason: (e as Error).message };
  }
}

/** The search window for a stranded traveler: tonight and tomorrow at the origin, arrive by the deadline. */
export function searchRequestFor(route: string, deadlineLabel: string, now = new Date()): SearchRequest {
  const m = route.match(/^([A-Z]{3}) to ([A-Z]{3})$/);
  const origin = m?.[1] ?? "SFO";
  const destination = m?.[2] ?? "JFK";
  // The demo trip departs SFO, so "tonight" is the Pacific date.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const t = deadlineLabel.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  const hour = t ? (Number(t[1]) % 12) + (t[3]!.toUpperCase() === "PM" ? 12 : 0) : 9;
  const minute = t ? t[2]! : "00";
  return {
    origin,
    destination,
    today,
    tomorrow,
    arriveBy: `${tomorrow}T${String(hour).padStart(2, "0")}:${minute}:00`,
    departAfter: localIso(new Date(now.getTime() + GATE_BUFFER_MS), "America/Los_Angeles"),
  };
}

/** A traveler needs time to get to a new gate, so flights leaving sooner than this are not offered. */
const GATE_BUFFER_MS = 60 * 60 * 1000;

/** The wall-clock time in a time zone as YYYY-MM-DDTHH:MM:SS, the format Duffel uses for local times. */
function localIso(d: Date, timeZone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
