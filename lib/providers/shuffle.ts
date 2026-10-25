import "server-only";
import { AIRPORTS } from "@/lib/airports";
import { searchRequestFor } from "./index";
import { cancelableFlights } from "./recorded";
import type { SearchRequest } from "./types";
import { clock, iso, LIVE_FARE_NOTE, mapItineraries, searchItineraries, serpapiConfigured, type SerpItinerary } from "./serpapi";

// "Another flight": a random real flight to cancel, and a random deadline. With FLIGHT_PROVIDER=serpapi
// it searches a random route between major US airports (two searches) and keeps that search for the
// cancel that follows, so a shuffle and its cancel cost two searches in all. Otherwise it picks from the
// recorded search. The flight and fare are real either way; the cancellation is simulated.

export interface PickedTrip {
  route: string;
  flight: string;
  departs: string;
  fareCents: number;
  /** Arrive-by time tomorrow at the destination, "7:30 AM". */
  deadline: string;
  source: string;
}

const FRESH_MS = 20 * 60_000;
// Kept on globalThis so a dev-server reload of this module keeps the last search.
const g = globalThis as { __reroutedSearch?: Map<string, { itineraries: SerpItinerary[]; at: number }> };
const searches = (g.__reroutedSearch ??= new Map());

/**
 * The traveler can take only flights that leave after the canceled one (30 minutes later, by when the
 * cancellation is known). Finds the canceled flight in the results by its title.
 */
export function afterCanceled(itineraries: readonly SerpItinerary[], flight: string, req: SearchRequest): SearchRequest {
  const it = itineraries.find((x) => titleOf(x) === flight);
  const dep = it?.flights[0] ? iso(it.flights[0].departure_airport.time) : null;
  if (!dep) return req;
  const later = new Date(new Date(`${dep}Z`).getTime() + 30 * 60_000).toISOString().slice(0, 19);
  return later > req.departAfter ? { ...req, departAfter: later } : req;
}

/** The live search a shuffle just ran for this flight, if it is still fresh (cancel reuses it). */
export function shuffledSearch(route: string, flight: string): SerpItinerary[] | null {
  const hit = searches.get(`${route}|${flight}`);
  return hit && Date.now() - hit.at < FRESH_MS ? hit.itineraries : null;
}

const pickOne = <T,>(xs: readonly T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)];

/** Tomorrow between 6:00 AM and 12:00 PM, on the half hour. */
function randomDeadline(): string {
  const slot = Math.floor(Math.random() * 13); // 6:00, 6:30, ... 12:00
  const h = 6 + Math.floor(slot / 2);
  return `${h === 12 ? 12 : h}:${slot % 2 ? "30" : "00"} ${h === 12 ? "PM" : "AM"}`;
}

const titleOf = (it: SerpItinerary) => {
  const airlines = [...new Set(it.flights.map((s) => s.airline))].join(" / ");
  return `${airlines} ${it.flights.map((s) => s.flight_number).join(", ")}`;
};

async function pickLive(current: string): Promise<PickedTrip> {
  const codes = Object.keys(AIRPORTS);
  for (let attempt = 0; attempt < 2; attempt++) {
    const from = pickOne(codes)!;
    const to = pickOne(codes.filter((c) => c !== from))!;
    const route = `${from} to ${to}`;
    const deadline = randomDeadline();
    const req = searchRequestFor(route, deadline);
    const itineraries = await searchItineraries(req);
    // The canceled flight: a real flight this afternoon or tonight (2 PM or later, not yet gone), in
    // random order, that leaves at least two other ways home after it.
    const today = itineraries.filter((it) => {
      const first = it.flights[0];
      const dep = first ? iso(first.departure_airport.time) : "";
      return typeof it.price === "number" && dep.slice(0, 10) === req.today && dep.slice(11) >= "14:00:00" && dep >= req.departAfter;
    });
    for (const it of [...today].sort(() => Math.random() - 0.5)) {
      const flight = titleOf(it);
      if (flight === current) continue;
      if (mapItineraries(itineraries, afterCanceled(itineraries, flight, req), LIVE_FARE_NOTE, flight).length < 2) continue;
      searches.set(`${route}|${flight}`, { itineraries, at: Date.now() });
      const departs = clock(iso(it.flights[0]!.departure_airport.time));
      return { route, flight, departs, fareCents: Math.round(it.price! * 100), deadline, source: "live flight search (Google Flights via SerpApi)" };
    }
  }
  throw new Error("Two random routes had no afternoon or evening flight left today with other ways home. Press Another flight again.");
}

function pickRecorded(current: string): PickedTrip {
  const pool = cancelableFlights((route) => searchRequestFor(route, "9:00 AM")).filter((f) => f.flight !== current);
  const pick = pickOne(pool);
  if (!pick) throw new Error("No other recorded flight to switch to.");
  return { route: pick.route, flight: pick.flight, departs: pick.departs, fareCents: pick.fareCents, deadline: randomDeadline(), source: "recorded flight search (Google Flights via SerpApi, Oct 25, 2026)" };
}

/** A random real flight to cancel, never the current one, with a random deadline. */
export async function pickTrip(current: string): Promise<PickedTrip> {
  return process.env.FLIGHT_PROVIDER === "serpapi" && serpapiConfigured() ? pickLive(current) : pickRecorded(current);
}
