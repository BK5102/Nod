"use client";

import fixture from "@/data/fixtures/demo.json";
import { money } from "./format";
import type { Mandate, Offer, Trip } from "./types";

const listingOf = new Map(fixture.offers.map((o) => [o.offerId, o.listingText]));

/**
 * Exactly what the agent sends Claude, mirrored from lib/agent/run.ts buildClaudeInput: the route,
 * the deadline, the card rules summary and each offer the search returned, with listing text marked as
 * untrusted. The offers are the ones in the database, so live flights show here as they were sent.
 * Live listing text is not stored in a public table, so only the saved offers show theirs.
 * Nothing about the traveler is sent.
 */
export function ClaudeSaw({
  trip,
  mandate,
  offers,
  onClose,
  inline = false,
}: {
  trip: Trip | null;
  mandate: Mandate | null;
  offers: Offer[];
  onClose: () => void;
  inline?: boolean;
}) {
  return (
    <div role={inline ? undefined : "dialog"} aria-labelledby="saw-h" className={`${inline ? "" : "absolute inset-0 z-10"} flex flex-col bg-card p-6`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="saw-h" className="text-[17px] font-extrabold">
            What the agent saw
          </h3>
          <p className="text-sm text-muted">One call per cancellation. The agent explains and flags; the card&apos;s rules decide.</p>
        </div>
        <button type="button" onClick={onClose} className="border border-line px-3 py-1 text-sm font-bold hover:bg-sunk">
          Close
        </button>
      </div>

      <div className="mt-4 grid min-h-0 flex-1 gap-5 overflow-y-auto md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 space-y-2 text-sm">
          <p>
            <span className="text-muted">Trip:</span> {trip?.route}. {trip?.deadlineText}.
          </p>
          <p>
            <span className="text-muted">Card rules:</span> {mandate?.summary}
          </p>
          {offers.length === 0 ? (
            <p className="mt-2 border-y border-line py-3 text-muted">Nothing sent yet. The agent makes this call once, after your flight is canceled and the search returns.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {offers.map((o) => {
                const listing = listingOf.get(o.offerId);
                return (
                  <li key={o.offerId} className="py-2">
                    <p className="font-bold">
                      {o.title} <span className="font-semibold text-muted">· {o.priceCents === 0 ? "Free" : money(o.priceCents)}</span>
                    </p>
                    <p className="text-[13px] text-muted">
                      {o.kind === "hotel" ? "One night" : `Departs ${o.departs}, arrives ${o.arrives}`} · {o.meetsDeadline ? "meets the deadline" : "misses the deadline"}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-snug text-muted">
                      <span className="font-mono text-xs">untrusted listing:</span> {listing ?? "the search result's own text, sent marked as untrusted (not stored in a public table)"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="space-y-3">
          <p className="text-sm font-extrabold">Never sent</p>
          <ul className="space-y-1.5 text-sm">
            {["Your name", "Your email", "Booking reference", "Loyalty number", "Card number or token"].map((x) => (
              <li key={x} className="flex items-center gap-2">
                <span className="h-0.5 w-3 bg-danger" aria-hidden="true" />
                {x}
              </li>
            ))}
          </ul>
          <p className="text-[13px] leading-snug text-muted">Listing text is third-party data. The agent is told never to follow it, and to flag a listing that tries.</p>
        </div>
      </div>
    </div>
  );
}
