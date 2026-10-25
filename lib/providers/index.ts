import "server-only";
import fixture from "@/data/fixtures/demo.json";
import { duffelConfigured, searchDuffel } from "./duffel";
import { searchSerpapi, serpapiConfigured } from "./serpapi";
import type { ProviderOffer, SearchRequest, SearchResult } from "./types";

const FIXTURE = fixture.offers as ProviderOffer[];

/** Live flight providers, chosen with FLIGHT_PROVIDER. Each returns flights in the offer table's shape. */
const PROVIDERS = {
  serpapi: { configured: serpapiConfigured, search: searchSerpapi, keyName: "SERPAPI_KEY", source: "live flight search (Google Flights via SerpApi)" },
  duffel: { configured: duffelConfigured, search: searchDuffel, keyName: "DUFFEL_ACCESS_TOKEN", source: "live flight search (Duffel test mode)" },
} as const;

/**
 * Where offers come from. FLIGHT_PROVIDER=serpapi (real current fares) or duffel (sandbox fares) returns
 * real search results only: flights, no simulated free rebooking or hotels. If that search fails, there
 * are no offers and the reason is reported; made-up offers never stand in for a failed live search.
 * With FLIGHT_PROVIDER unset, the saved demo offers (SIMULATED) are used, for offline development and
 * the policy tests. Offers keep the same shape either way. No provider is ever asked to book.
 */
export async function findOffers(req: SearchRequest): Promise<SearchResult> {
  const name = process.env.FLIGHT_PROVIDER;
  if (name !== "serpapi" && name !== "duffel") return { offers: FIXTURE, source: "saved demo offers (SIMULATED)", fallbackReason: null };
  const provider = PROVIDERS[name];
  if (!provider.configured()) return { offers: [], source: provider.source, fallbackReason: `${provider.keyName} is not set` };
  try {
    const flights = await provider.search(req);
    if (flights.length === 0) throw new Error(`no USD flights from ${req.origin} to ${req.destination} tonight or tomorrow`);
    return { offers: flights, source: provider.source, fallbackReason: null };
  } catch (e) {
    return { offers: [], source: provider.source, fallbackReason: (e as Error).message };
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

/** The wall-clock time in a time zone as YYYY-MM-DDTHH:MM:SS, the format the providers are compared in. */
function localIso(d: Date, timeZone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
