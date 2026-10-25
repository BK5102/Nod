import "server-only";
import type { ProviderOffer, SearchRequest } from "./types";

// Duffel flight search (https://duffel.com/docs/api/v2/offer-requests/create-offer-request).
// Server-only: the access token never reaches the browser. In test mode the airlines and fares are
// Duffel's sandbox data, so every offer from here is labeled as such.

const URL = "https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=8000";
const MAX_FLIGHTS = 4;

interface DuffelSegment {
  departing_at: string;
  arriving_at: string;
  marketing_carrier: { name: string; iata_code: string };
  marketing_carrier_flight_number: string;
}

interface DuffelOffer {
  id: string;
  total_amount: string;
  total_currency: string;
  owner: { name: string; iata_code: string };
  slices: { segments: DuffelSegment[] }[];
  conditions?: { refund_before_departure?: { allowed: boolean } | null } | null;
}

export function duffelConfigured(): boolean {
  return !!process.env.DUFFEL_ACCESS_TOKEN;
}

/** "2026-10-25T06:45:00" (local airport time) -> "6:45 AM". */
function clock(local: string): string {
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

async function search(token: string, req: SearchRequest, date: string, signal: AbortSignal): Promise<DuffelOffer[]> {
  const res = await fetch(URL, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      "Duffel-Version": "v2",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      data: {
        slices: [{ origin: req.origin, destination: req.destination, departure_date: date }],
        passengers: [{ type: "adult" }],
        cabin_class: "economy",
        max_connections: 1,
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Duffel returned ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }
  const json = (await res.json()) as { data?: { offers?: DuffelOffer[] } };
  return json.data?.offers ?? [];
}

/**
 * Searches tonight and tomorrow, maps each Duffel offer into the offer table's shape, and keeps the
 * best few: those that land before the deadline first, then cheapest. Only USD fares are kept, because
 * the card's rules are in US dollars.
 */
export async function searchDuffel(req: SearchRequest, timeoutMs = 9_000): Promise<ProviderOffer[]> {
  const token = process.env.DUFFEL_ACCESS_TOKEN;
  if (!token) throw new Error("DUFFEL_ACCESS_TOKEN is not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const batches = await Promise.all([req.today, req.tomorrow].map((d) => search(token, req, d, controller.signal)));
    const seen = new Set<string>();
    const mapped: ProviderOffer[] = [];
    for (const o of batches.flat()) {
      const segs = o.slices[0]?.segments ?? [];
      const first = segs[0];
      const last = segs.at(-1);
      if (!first || !last || o.total_currency !== "USD") continue;
      // Sandbox data can include departures that already left; a stranded traveler cannot take those.
      if (first.departing_at < req.departAfter) continue;
      const flights = segs.map((s) => `${s.marketing_carrier.iata_code}${s.marketing_carrier_flight_number}`).join(", ");
      if (seen.has(flights)) continue;
      seen.add(flights);
      const stops = segs.length === 1 ? "Nonstop" : `${segs.length - 1} stop`;
      const refundable = !!o.conditions?.refund_before_departure?.allowed;
      mapped.push({
        offerId: `duf_${o.id}`,
        kind: "flight",
        merchant: o.owner.name,
        title: `${o.owner.name} ${flights}`,
        departs: `${dayLabel(first.departing_at, req)} ${clock(first.departing_at)}`,
        arrives: `${dayLabel(last.arriving_at, req)} ${clock(last.arriving_at)}`,
        meetsDeadline: last.arriving_at <= req.arriveBy,
        priceCents: Math.round(Number(o.total_amount) * 100),
        refundable,
        category: "airline",
        mcc: "4511",
        listingText: `${stops} ${req.origin} to ${req.destination}, economy. ${refundable ? "Refundable before departure." : "Not refundable."} Fare from Duffel test mode.`,
      });
    }
    return mapped
      .sort((a, b) => Number(b.meetsDeadline) - Number(a.meetsDeadline) || a.priceCents - b.priceCents)
      .slice(0, MAX_FLIGHTS);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error(`Duffel did not answer within ${timeoutMs / 1000} seconds`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
