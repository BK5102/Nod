"use client";

import { useEffect, useState } from "react";
import { deadlineDelta, clockHours, elapsed } from "./format";
import { Pictogram, type PictoName } from "./Pictogram";
import type { Offer, Trip } from "./types";

function message(trip: Trip, offers: Offer[]): { picto: PictoName; lead: string; big: string; tone: "yellow" | "black" } {
  const open = offers.filter((o) => o.rank > 0);
  const booked = offers.find((o) => o.status === "booked" && o.kind !== "hotel");
  switch (trip.status) {
    case "scheduled":
      return { picto: "depart", lead: `${trip.flight} · ${trip.route}`, big: `Departs ${trip.departs}`, tone: "yellow" };
    case "canceled":
      return { picto: "closed", lead: `${trip.flight} is canceled`, big: "Finding you a way to JFK by 9:00 AM", tone: "black" };
    case "options_ready": {
      const making = open.filter((o) => o.meetsDeadline && o.kind !== "hotel").length;
      return {
        picto: "reroute",
        lead: `${open.length} ways home, ranked against your deadline`,
        big: `${making} ${making === 1 ? "lands" : "land"} before 9:00 AM`,
        tone: "yellow",
      };
    }
    case "booked": {
      const arr = booked ? clockHours(booked.arrives, 0) : null;
      return {
        picto: "arrive",
        lead: booked ? `Booked: ${booked.merchant} ${booked.title.toLowerCase()}` : "Booked",
        big: booked ? `Lands ${booked.arrives}${arr !== null && deadlineDelta(arr).before ? ", before 9:00 AM" : ""}` : "",
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

  if (!trip) return <header className="sign h-28" />;
  const m = message(trip, offers);
  const black = m.tone === "black";

  return (
    <header className={`${black ? "board" : "sign on-yellow"} sticky top-0 z-30 border-b-4 border-ink`}>
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:flex-nowrap md:gap-6 md:px-8 md:py-4">
        <div className="flex flex-1 items-center gap-3 md:min-w-[11rem] md:flex-none">
          <Pictogram name="reroute" size={40} label="Rerouted" className={black ? "bg-yellow! text-ink!" : ""} />
          <span className="text-xl font-extrabold tracking-tight md:text-2xl">Rerouted</span>
        </div>

        <div key={`${trip.status}-${m.big}`} className="flap order-last flex w-full min-w-0 items-center gap-4 md:order-none md:w-auto md:flex-1" aria-live="polite">
          <Pictogram name={m.picto} size={64} className={`hidden sm:inline-grid ${black ? "bg-alert! text-ink!" : ""}`} />
          <div className="min-w-0">
            <p className={`text-base font-semibold leading-tight md:text-xl ${black ? "text-alert" : "text-yellow-soft"}`}>{m.lead}</p>
            <p className="text-[1.65rem] font-black leading-[1.05] tracking-[-0.02em] [text-wrap:balance] md:text-[2.75rem]">{m.big}</p>
          </div>
        </div>

        {trip.canceledAt ? (
          <div className="text-right">
            <p className={`text-sm font-semibold leading-tight md:text-base ${black ? "text-soft" : "text-yellow-soft"}`}>
              {trip.bookedAt ? "Canceled to booked" : "Since the cancellation"}
            </p>
            <p className="font-mono text-2xl font-semibold leading-none md:text-4xl">
              {elapsed(trip.canceledAt, trip.bookedAt ? Date.parse(trip.bookedAt) : now)}
            </p>
          </div>
        ) : null}
      </div>
    </header>
  );
}
