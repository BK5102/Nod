import "server-only";
import recorded from "@/data/fixtures/recorded-flights.json";
import { clock, iso, mapItineraries, type SerpItinerary } from "./serpapi";
import type { ProviderOffer, SearchRequest } from "./types";

// A recorded real search (data/fixtures/recorded-flights.json): Google Flights results for a few West
// Coast routes on two days. It supplies the real flights the demo can cancel, and replays their
// alternatives when FLIGHT_PROVIDER is unset, through the same mapping as a live SerpApi search.

const ROUTES = recorded.routes as Record<string, Record<string, SerpItinerary[]>>;
const [DAY1, DAY2] = recorded.days as [string, string];
const FARE_NOTE = `Fare from Google Flights via SerpApi, recorded ${recorded.recordedOn}.`;

/** A real flight the demo can cancel (the cancellation is simulated; the flight and fare are recorded). */
export interface RealFlight {
  route: string;
  flight: string;
  departs: string;
  fareCents: number;
  /** Local departure, YYYY-MM-DDTHH:MM:SS. */
  departsAt: string;
}

function departureOf(route: string, flight: string): string | null {
  for (const it of ROUTES[route]?.[DAY1] ?? []) {
    const f = it.flights[0];
    if (it.flights.length === 1 && f && `${f.airline} ${f.flight_number}` === flight) return iso(f.departure_airport.time);
  }
  return null;
}

/** "2026-10-25T16:15:00" plus one hour, as local wall-clock time (the gate buffer the live search uses). */
function plusHour(local: string): string {
  const d = new Date(`${local}Z`);
  return new Date(d.getTime() + 3_600_000).toISOString().slice(0, 19);
}

/** The recorded window for a stranded traveler: an hour after the canceled departure, land by the deadline. */
function recordedRequest(route: string, flight: string, live: SearchRequest): SearchRequest {
  return {
    ...live,
    today: DAY1,
    tomorrow: DAY2,
    arriveBy: `${DAY2}${live.arriveBy.slice(10)}`,
    departAfter: plusHour(departureOf(route, flight) ?? `${DAY1}T15:00:00`),
  };
}

/** Alternatives to the canceled flight from the recorded search: later flights tonight and tomorrow. */
export function recordedOffers(route: string, flight: string, live: SearchRequest): ProviderOffer[] {
  const days = ROUTES[route];
  if (!days) return [];
  return mapItineraries([...(days[DAY1] ?? []), ...(days[DAY2] ?? [])], recordedRequest(route, flight, live), FARE_NOTE, flight);
}

/**
 * The real flights the demo can cancel: nonstop, leaving 3 PM to 9 PM local on the first recorded day,
 * with at least two alternatives in the recorded search.
 */
export function cancelableFlights(live: (route: string) => SearchRequest): RealFlight[] {
  const out: RealFlight[] = [];
  const seen = new Set<string>();
  for (const [route, days] of Object.entries(ROUTES)) {
    for (const it of days[DAY1] ?? []) {
      const f = it.flights[0];
      if (it.flights.length !== 1 || !f || typeof it.price !== "number") continue;
      const at = iso(f.departure_airport.time);
      const hhmm = at.slice(11, 16);
      const flight = `${f.airline} ${f.flight_number}`;
      if (hhmm < "15:00" || hhmm > "21:00" || seen.has(`${route} ${flight}`)) continue;
      seen.add(`${route} ${flight}`);
      if (recordedOffers(route, flight, live(route)).length < 2) continue;
      out.push({ route, flight, departs: clock(at), fareCents: Math.round(it.price * 100), departsAt: at });
    }
  }
  return out;
}
