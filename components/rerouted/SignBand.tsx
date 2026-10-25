"use client";

import { useEffect, useState } from "react";
import { clockHours, deadlineDelta, elapsed, timeOnly } from "./format";
import type { Offer, Trip } from "./types";

/** The one thing to know right now, at sign scale. Neutral except the canceled state. */
export function SignBand({ trip, offers }: { trip: Trip | null; offers: Offer[] }) {
  const [now, setNow] = useState(() => Date.now());
  const ticking = trip?.canceledAt && trip.status !== "booked";
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  const ranked = offers.filter((o) => o.rank > 0);
  const aside = offers.length - ranked.length;
  const booked = offers.find((o) => o.status === "booked" && o.kind !== "hotel");
  const making = ranked.filter((o) => o.meetsDeadline && o.kind !== "hotel").length;

  let big = "";
  let detail: React.ReactNode = "";
  let alert = false;
  switch (trip?.status) {
    case "scheduled":
      big = "On time";
      detail = `${trip.flight}, SFO ${trip.departs} to JFK. ${trip.deadlineText}.`;
      break;
    case "canceled":
      big = "Canceled";
      alert = true;
      detail = (
        <>
          <span className="line-through decoration-danger decoration-2">
            {trip.flight}, {trip.departs}
          </span>
          <span className="ml-3">You need to be at JFK by 9:00 AM.</span>
        </>
      );
      break;
    case "options_ready":
      big = `${making} way${making === 1 ? "" : "s"} home by 9:00 AM`;
      detail = `${ranked.length} options inside your card's rules${aside ? `, ${aside} set aside` : ""}.`;
      break;
    case "booked": {
      const arr = booked ? clockHours(booked.arrives, 0) : null;
      const d = arr !== null ? deadlineDelta(arr) : null;
      big = booked ? `Booked. Lands ${timeOnly(booked.arrives)}` : "Booked";
      detail = booked ? `${booked.title}${d ? `, ${d.text}` : ""}.` : "";
      break;
    }
  }

  return (
    <header className="flex h-[112px] shrink-0 items-center gap-8 px-8">
      <div key={`${trip?.status}-${big}`} className="flap min-w-0 flex-1" aria-live="polite">
        <p className={`display truncate text-[2.75rem] leading-[1.02] ${alert ? "text-danger uppercase" : "text-fg"}`}>{big || " "}</p>
        <p className="mt-1 truncate text-[15px] text-muted">{detail}</p>
      </div>
      {trip?.canceledAt ? (
        <div className="text-right">
          <p className="text-sm font-semibold text-muted">{trip.bookedAt ? "Canceled to booked" : "Since the cancellation"}</p>
          <p className="display text-[2rem] leading-none">{elapsed(trip.canceledAt, trip.bookedAt ? Date.parse(trip.bookedAt) : now)}</p>
        </div>
      ) : null}
    </header>
  );
}
