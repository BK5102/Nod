"use client";

import fixture from "@/data/fixtures/demo.json";
import type { Mandate, Trip } from "./types";

/**
 * Exactly what the agent sends Claude, mirrored from lib/agent/run.ts buildClaudeInput: the route,
 * the deadline, the card rules summary and each offer's public fields, with listing text marked as
 * untrusted. Nothing about the traveler is sent.
 */
export function ClaudeSaw({ trip, mandate, onClose }: { trip: Trip | null; mandate: Mandate | null; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="false" aria-labelledby="saw-h" className="absolute inset-0 z-10 flex flex-col bg-panel/97 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="saw-h" className="text-xl font-extrabold">
            What Claude saw
          </h3>
          <p className="text-base text-soft">One call per cancellation. Claude explains and flags; the card&apos;s rules decide.</p>
        </div>
        <button type="button" onClick={onClose} className="border border-rule px-3 py-1 text-base font-bold hover:bg-panel-2">
          Close
        </button>
      </div>

      <div className="mt-4 grid min-h-0 flex-1 gap-5 overflow-y-auto md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 space-y-2 text-base">
          <p>
            <span className="text-soft">Trip:</span> {trip?.route}. {trip?.deadlineText}.
          </p>
          <p>
            <span className="text-soft">Card rules:</span> {mandate?.summary}
          </p>
          <ul className="mt-2 divide-y divide-rule border-y border-rule">
            {fixture.offers.map((o) => (
              <li key={o.offerId} className="py-2">
                <p className="font-bold">
                  {o.title} <span className="font-semibold text-soft">· ${(o.priceCents / 100).toLocaleString("en-US")}</span>
                </p>
                <p className="mt-0.5 text-sm leading-snug text-soft">
                  <span className="font-mono text-xs">untrusted listing:</span> {o.listingText}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <p className="text-base font-extrabold">Never sent</p>
          <ul className="space-y-1.5 text-base">
            {["Your name", "Your email", "Booking reference", "Loyalty number", "Card number or token"].map((x) => (
              <li key={x} className="flex items-center gap-2">
                <span className="h-0.5 w-3 bg-alert" aria-hidden="true" />
                {x}
              </li>
            ))}
          </ul>
          <p className="text-sm leading-snug text-soft">Listing text is third-party data. Claude is told never to follow it, and to flag a listing that tries.</p>
        </div>
      </div>
    </div>
  );
}
