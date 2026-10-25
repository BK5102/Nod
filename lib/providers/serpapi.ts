import "server-only";
import type { ProviderOffer, SearchRequest } from "./types";

// Google Flights results through SerpApi (https://serpapi.com/google-flights-api). Search only: fares are
// real and current, and nothing here can book. Server-only: the API key never reaches the browser.

const URL = "https://serpapi.com/search";
const MAX_FLIGHTS = 4;

export interface SerpSegment {
  departure_airport: { id: string; time: string };
  arrival_airport: { id: string; time: string };
  airline: string;
  flight_number: string;
}

export interface SerpItinerary {
  flights: SerpSegment[];
  price?: number;
}

export function serpapiConfigured(): boolean {
  return !!process.env.SERPAPI_KEY;
}

/** "2026-10-25 06:45" (local airport time) -> "2026-10-25T06:45:00", the format SearchRequest uses. */
export function iso(local: string): string {
  return `${local.replace(" ", "T")}:00`;
}

/** "2026-10-25T06:45:00" -> "6:45 AM". */
export function clock(local: string): string {
  const [h, m] = local.slice(11, 16).split(":").map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Day label relative to the stranded traveler's tonight: "Tonight", "Today", "Tomorrow" or the date. */
function dayLabel(local: string, req: SearchRequest): string {
  const date = local.slice(0, 10);
  if (date === req.today) return Number(local.slice(11, 13)) >= 17 ? "Tonight" : "Today";
  if (date === req.tomorrow) return "Tomorrow";
  const d = new Date(`${date}T12:00:00Z`);
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${d.getUTCDate()}`;
}

async function search(key: string, req: SearchRequest, date: string, signal: AbortSignal): Promise<SerpItinerary[]> {
  const params = new URLSearchParams({
    engine: "google_flights",
    departure_id: req.origin,
    arrival_id: req.destination,
    outbound_date: date,
    type: "2", // one way
    travel_class: "1", // economy
    stops: "2", // one stop or fewer
    currency: "USD",
    hl: "en",
    gl: "us",
    api_key: key,
  });
  const res = await fetch(`${URL}?${params}`, { signal, headers: { Accept: "application/json" } });
  const json = (await res.json().catch(() => ({}))) as { error?: string; best_flights?: SerpItinerary[]; other_flights?: SerpItinerary[] };
  // SerpApi reports "no results" as an error string; that is an empty day, not a failure.
  if (json.error && /hasn't returned any results/i.test(json.error)) return [];
  if (!res.ok || json.error) throw new Error(`SerpApi returned ${res.status}${json.error ? `: ${json.error.slice(0, 160)}` : ""}`);
  return [...(json.best_flights ?? []), ...(json.other_flights ?? [])];
}

/**
 * Maps Google Flights itineraries into the offer table's shape and keeps the best few: those that land
 * before the deadline first, then cheapest. Google Flights does not say whether a fare is refundable, so
 * every offer is treated as non-refundable. `exclude` drops one flight by its title (the canceled one).
 */
export function mapItineraries(itineraries: readonly SerpItinerary[], req: SearchRequest, fareNote: string, exclude = ""): ProviderOffer[] {
  const seen = new Set<string>();
  const mapped: ProviderOffer[] = [];
  for (const it of itineraries) {
    const segs = it.flights ?? [];
    const first = segs[0];
    const last = segs.at(-1);
    if (!first || !last || typeof it.price !== "number") continue;
    const departs = iso(first.departure_airport.time);
    const arrives = iso(last.arrival_airport.time);
    if (departs < req.departAfter) continue;
    const flights = segs.map((s) => s.flight_number).join(", "); // "B6 16", as Google Flights writes it
    if (seen.has(flights)) continue;
    seen.add(flights);
    const airlines = [...new Set(segs.map((s) => s.airline))].join(" / ");
    const title = `${airlines} ${flights}`;
    if (title === exclude) continue;
    const stops = segs.length === 1 ? "Nonstop" : `${segs.length - 1} stop via ${segs.slice(0, -1).map((s) => s.arrival_airport.id).join(", ")}`;
    mapped.push({
      offerId: `serp_${departs.slice(0, 10)}_${flights.replace(/[^A-Za-z0-9]+/g, "_")}`,
      kind: "flight",
      merchant: airlines,
      title,
      departs: `${dayLabel(departs, req)} ${clock(departs)}`,
      arrives: `${dayLabel(arrives, req)} ${clock(arrives)}`,
      meetsDeadline: arrives <= req.arriveBy,
      priceCents: Math.round(it.price * 100),
      refundable: false,
      category: "airline",
      mcc: "4511",
      listingText: `${stops}, ${req.origin} to ${req.destination}, economy. Refund rules not shown. ${fareNote}`,
    });
  }
  return mapped
    .sort((a, b) => Number(b.meetsDeadline) - Number(a.meetsDeadline) || a.priceCents - b.priceCents)
    .slice(0, MAX_FLIGHTS);
}

export const LIVE_FARE_NOTE = "Current fare from Google Flights via SerpApi.";

/** The raw itineraries for tonight and tomorrow: two searches, run in parallel. */
export async function searchItineraries(req: SearchRequest, timeoutMs = 9_000): Promise<SerpItinerary[]> {
  const key = process.env.SERPAPI_KEY;
  if (!key) throw new Error("SERPAPI_KEY is not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const batches = await Promise.all([req.today, req.tomorrow].map((d) => search(key, req, d, controller.signal)));
    return batches.flat();
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error(`SerpApi did not answer within ${timeoutMs / 1000} seconds`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Searches tonight and tomorrow and maps the results (see mapItineraries). */
export async function searchSerpapi(req: SearchRequest, timeoutMs = 9_000, exclude = ""): Promise<ProviderOffer[]> {
  return mapItineraries(await searchItineraries(req, timeoutMs), req, LIVE_FARE_NOTE, exclude);
}
