"use client";

import { useEffect, useState } from "react";
import { clockHours, deadlineDelta, elapsed, timeOnly } from "./format";
import { Pictogram, type PictoName } from "./Pictogram";
import type { Offer, Trip } from "./types";

// Sign grammar: the one thing to know, at sign scale, with the detail beneath it ("D1-D57 / 12 min walk").
function message(trip: Trip, offers: Offer[]): { picto: PictoName; big: string; detail: string; tone: "yellow" | "black" } {
  const open = offers.filter((o) => o.rank > 0);
  const booked = offers.find((o) => o.status === "booked" && o.kind !== "hotel");
  switch (trip.status) {
    case "scheduled":
      return { picto: "depart", big: `To JFK, ${trip.departs}`, detail: `${trip.flight} from SFO`, tone: "yellow" };
    case "canceled":
      return { picto: "closed", big: "Canceled", detail: `${trip.flight}. Finding you a way home.`, tone: "black" };
    case "options_ready": {
      const making = open.filter((o) => o.meetsDeadline && o.kind !== "hotel").length;
      return {
        picto: "reroute",
        big: `${making} way${making === 1 ? "" : "s"} home by 9:00 AM`,
        detail: `${open.length} options, ranked inside your card's rules`,
        tone: "yellow",
      };
    }
    case "booked": {
      const arr = booked ? clockHours(booked.arrives, 0) : null;
      const delta = arr !== null ? deadlineDelta(arr) : null;
      return {
        picto: "arrive",
        big: booked ? `Booked. Lands ${timeOnly(booked.arrives)}` : "Booked",
        detail: booked ? `${booked.title}.${delta ? ` ${delta.text}.` : ""}` : "",
        tone: "yellow",
      };
    }
  }
}

export function SignBand({ trip, offers }: { trip: Trip | null; offers: Offer[] }) {
  const [now, setNow] = useState(() => Date.now());
  const ticking = trip?.canceledAt && trip.status !== "booked";
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  if (!trip) return <header className="sign h-32" />;
  const m = message(trip, offers);
  const black = m.tone === "black";

  return (
    <header className={`${black ? "board" : "sign on-yellow"} top-0 z-30 border-b-4 border-ink md:sticky`}>
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 md:flex-nowrap md:gap-8 md:px-8 md:py-4">
        <div className="flex flex-1 items-center gap-3 md:flex-none md:self-start md:pt-2">
          <Pictogram name="reroute" size={40} label="Rerouted" className={black ? "bg-yellow! text-ink!" : ""} />
          <span className="text-xl font-extrabold tracking-tight md:text-2xl">Rerouted</span>
        </div>

        <div key={`${trip.status}-${m.big}`} className="flap order-last flex w-full min-w-0 items-center gap-4 md:order-none md:w-auto md:flex-1 md:gap-6" aria-live="polite">
          <Pictogram name={m.picto} size={88} className={`hidden md:inline-grid ${black ? "bg-alert! text-ink!" : ""}`} />
          <div className="min-w-0">
            <p className={`text-[2.4rem] leading-[0.95] font-black tracking-[-0.03em] [text-wrap:balance] md:text-[4.25rem] ${black ? "text-alert" : ""}`}>{m.big}</p>
            <p className={`mt-1.5 text-base leading-snug font-semibold md:text-xl ${black ? "text-white" : "text-yellow-soft"}`}>{m.detail}</p>
          </div>
        </div>

        {trip.canceledAt ? (
          <div className="text-right md:self-start md:pt-2">
            <p className={`text-sm leading-tight font-semibold md:text-base ${black ? "text-soft" : "text-yellow-soft"}`}>{trip.bookedAt ? "Canceled to booked" : "Since the cancellation"}</p>
            <p className="text-3xl leading-none font-black tabular-nums md:text-5xl">{elapsed(trip.canceledAt, trip.bookedAt ? Date.parse(trip.bookedAt) : now)}</p>
          </div>
        ) : null}
      </div>
    </header>
  );
}
