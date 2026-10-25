import type { OfferInput } from "@/spacetimedb/src/core/types";

/** One offer as a provider returns it: the offer table's fields plus third-party listing text (untrusted). */
export interface ProviderOffer extends OfferInput {
  listingText: string;
}

/** What a flight search needs to know about the stranded trip. */
export interface SearchRequest {
  origin: string;
  destination: string;
  /** Local date at the origin for "tonight", YYYY-MM-DD. */
  today: string;
  /** Local date for "tomorrow", YYYY-MM-DD. */
  tomorrow: string;
  /** Latest acceptable local arrival at the destination, YYYY-MM-DDTHH:MM:SS. */
  arriveBy: string;
}

export interface SearchResult {
  offers: ProviderOffer[];
  /** Plain description of where the offers came from, shown as an agent step. */
  source: string;
  /** Set when the live search failed and the run fell back to saved offers. */
  fallbackReason: string | null;
}
