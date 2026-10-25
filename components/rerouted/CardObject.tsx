"use client";

import { useEffect, useRef, useState } from "react";
import { money } from "./format";
import { Pictogram } from "./Pictogram";
import type { Mandate, Trip } from "./types";

/** Counts up to a new value once, so the spend visibly lands on the meter. */
function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const a = from.current;
    if (a === target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      setV(Math.round((a + (target - a) * (1 - Math.pow(2, -10 * k))) / 100) * 100);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/**
 * The traveler's card as an object, with the three rules it enforces and the spend against its cap.
 * The card and payment are simulated; the rules are the real ones the database checks.
 */
export function CardObject({ mandate, trip }: { mandate: Mandate | null; trip: Trip | null }) {
  const cap = mandate?.tripCapCents ?? 0;
  const spent = trip?.spendCents ?? 0;
  const shown = useCountUp(spent);
  const pct = cap ? Math.min(100, (spent / cap) * 100) : 0;
  const askPct = cap && mandate ? (mandate.askAboveCents / cap) * 100 : 0;

  return (
    <section aria-labelledby="card-h" className="flex flex-col gap-4">
      <div className="relative aspect-[2.1] w-full border border-rule bg-ink p-4">
        <div className="flex items-start justify-between">
          <h2 id="card-h" className="text-lg font-extrabold">
            Travel card
          </h2>
          <span className="border border-rule px-2 py-0.5 text-xs font-bold text-soft">Simulated</span>
        </div>
        <p className="absolute bottom-4 left-4 font-mono text-xl font-semibold tracking-[0.12em]">•••• 4242</p>
        <Pictogram name="card" size={36} className="absolute right-4 bottom-3 bg-panel-2!" />
      </div>

      <div>
        <p className="flex items-baseline justify-between">
          <span className="text-[2rem] leading-none font-black tabular-nums">{money(shown)}</span>
          <span className="text-lg font-bold text-soft tabular-nums">of {money(cap)} trip cap</span>
        </p>
        <div className="relative mt-3 h-3 bg-panel-2" role="meter" aria-valuemin={0} aria-valuemax={cap / 100} aria-valuenow={spent / 100} aria-label="Spent against the trip cap">
          <div className="absolute inset-y-0 left-0 bg-white transition-[width] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ width: `${pct}%` }} />
          <div className="absolute -top-1.5 -bottom-1.5 w-0.5 bg-soft" style={{ left: `${askPct}%` }} />
        </div>
      </div>

      <ul className="divide-y divide-rule border-y border-rule text-lg">
        <li className="flex justify-between gap-4 py-2">
          <span className="text-soft">Trip cap</span>
          <span className="font-bold tabular-nums">{money(cap)}</span>
        </li>
        <li className="flex justify-between gap-4 py-2">
          <span className="text-soft">Asks you above</span>
          <span className="font-bold tabular-nums">{mandate ? money(mandate.askAboveCents) : ""}</span>
        </li>
        <li className="flex justify-between gap-4 py-2">
          <span className="text-soft">Allowed</span>
          <span className="font-bold">Airlines, hotels</span>
        </li>
      </ul>
    </section>
  );
}
