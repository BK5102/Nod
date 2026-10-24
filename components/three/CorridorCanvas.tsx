"use client";

import { useEffect, useRef } from "react";
import type { Offer, Trip } from "@/components/rerouted/types";
import type { Corridor } from "./corridor";

export function CorridorCanvas({ trip, offers, refusedPulse }: { trip: Trip | null; offers: Offer[]; refusedPulse: { offerId: string; n: number } | null }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<Corridor | null>(null);
  const latest = useRef({ trip, offers });
  latest.current = { trip, offers };

  useEffect(() => {
    let alive = true;
    let made: Corridor | null = null;
    // Labels are drawn on canvases, so wait for the sign face before building the stage.
    Promise.all([import("./corridor"), document.fonts.ready]).then(([{ Corridor }]) => {
      if (!alive || !host.current) return;
      made = new Corridor(host.current);
      scene.current = made;
      made.update(latest.current.trip, latest.current.offers);
    });
    return () => {
      alive = false;
      made?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    scene.current?.update(trip, offers);
  }, [trip, offers]);

  useEffect(() => {
    if (refusedPulse) scene.current?.refuse(refusedPulse.offerId);
  }, [refusedPulse]);

  return <div ref={host} className="absolute inset-0" aria-hidden="true" />;
}
