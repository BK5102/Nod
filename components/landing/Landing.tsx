"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CorridorCanvas } from "@/components/three/CorridorCanvas";
import { createMockEngine } from "@/components/rerouted/mock";
import { Pictogram, type PictoName } from "@/components/rerouted/Pictogram";

type Engine = ReturnType<typeof createMockEngine>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One beat of the hero replay: what the caption says while the scene performs it. */
interface Beat {
  id: string;
  head: string;
  sub: string;
  tone: "white" | "yellow" | "alert";
}

const BEATS: Beat[] = [
  { id: "scheduled", head: "Bayline 412 to JFK", sub: "Departs SFO at 6:40 PM", tone: "white" },
  { id: "canceled", head: "Canceled", sub: "The agent starts shopping", tone: "alert" },
  { id: "options", head: "4 ways home", sub: "Ranked against your 9:00 AM deadline", tone: "yellow" },
  { id: "refused", head: "Agent refused", sub: "It cannot approve its own purchase", tone: "alert" },
  { id: "price", head: "$389 to $412", sub: "The price moved, so the old quote is void", tone: "yellow" },
  { id: "booked", head: "Booked, $412", sub: "Lands 6:45 AM, 2 h 15 min early", tone: "yellow" },
];

/** The hero's corridor plays the demo once on a private mock engine. It never touches the live database. */
function useReplay() {
  const engine = useRef<Engine | null>(null);
  engine.current ??= createMockEngine();
  const e = engine.current;
  const state = useSyncExternalStore(e.subscribe, e.getState, e.getState);
  const [round, setRound] = useState(0);
  const [beat, setBeat] = useState(0);
  const [pulse, setPulse] = useState<{ offerId: string; n: number } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    const go = (i: number) => alive && setBeat(i);
    (async () => {
      setDone(false);
      go(0);
      await e.actions.reset();
      await sleep(1400);
      if (!alive) return;
      go(1);
      await e.actions.cancel();
      if (!alive) return;
      go(2);
      await sleep(2600);
      const top = e.getState().offers.find((o) => o.rank === 1);
      if (!alive || !top) return;
      go(3);
      await e.actions.agentTryApprove(top.offerId);
      setPulse({ offerId: top.offerId, n: Date.now() });
      await sleep(2200);
      if (!alive) return;
      go(4);
      await e.actions.setPrice(top.offerId, 41200);
      await sleep(2000);
      const fresh = e.getState().offers.find((o) => o.offerId === top.offerId);
      if (!alive || !fresh) return;
      await e.actions.approve(fresh.offerId, fresh.quoteHash);
      go(5);
      await sleep(2600);
      if (alive) setDone(true);
    })();
    return () => {
      alive = false;
    };
  }, [e, round]);

  return { state, beat, pulse, done, replay: () => setRound((n) => n + 1) };
}

const beats: { picto: PictoName; head: string; line: string }[] = [
  { picto: "refund", head: "Free first", line: "It checks the airline's free rebooking before it spends anything." },
  { picto: "card", head: "Your card decides", line: "Trip cap, ask-first limit, allowed categories. Enforced in the database." },
  { picto: "agent", head: "The agent cannot pay itself", line: "Only your tap buys, at the exact price you saw." },
  { picto: "arrive", head: "A receipt you can check", line: "Hash-chained, with the refund you are owed." },
];

export function Landing() {
  const { state, beat, pulse, done, replay } = useReplay();
  const now = BEATS[beat]!;
  const toneClass = now.tone === "alert" ? "text-alert" : now.tone === "yellow" ? "text-yellow" : "text-white";

  return (
    <div className="min-h-dvh bg-ink text-white">
      <header className="sign on-yellow">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <Pictogram name="reroute" size={40} label="Rerouted" />
            <span className="text-2xl font-extrabold tracking-tight">Rerouted</span>
          </Link>
          <Link href="/login" className="flex items-center gap-3 bg-ink px-4 py-2.5 text-lg font-extrabold text-white transition-colors hover:bg-panel-2">
            Sign in
          </Link>
        </div>
      </header>

      <section className="sign on-yellow border-b-4 border-ink">
        <div className="mx-auto grid max-w-[1600px] items-center gap-10 px-4 pt-10 pb-14 md:px-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)] lg:pt-16 lg:pb-20">
          <div className="flap">
            <h1 className="text-[3.25rem] leading-[0.92] font-black tracking-[-0.04em] [text-wrap:balance] md:text-[5.5rem]">Canceled? Rerouted.</h1>
            <p className="mt-5 max-w-[34ch] text-xl leading-snug font-semibold text-yellow-soft md:text-2xl">
              An agent shops your way home inside your card&apos;s rules. You approve with one tap.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/login" className="flex items-center gap-3 bg-ink py-3 pr-5 pl-3 text-xl font-extrabold text-white transition-[transform,background-color] hover:bg-panel-2 active:scale-[0.985]">
                <Pictogram name="depart" size={36} className="bg-yellow! text-ink!" />
                Open the dashboard
              </Link>
            </div>
          </div>

          {/* The show: the corridor performs each beat while a caption flips above it. */}
          <div className="board relative overflow-hidden border-4 border-ink">
            <div className="relative h-[360px] sm:h-[460px] lg:h-[560px]">
              <CorridorCanvas trip={state.trip} offers={state.offers} refusedPulse={pulse} />

              <div className="pointer-events-none absolute top-0 left-0 bg-panel/90 px-5 py-4">
                <p key={now.id} className={`flap text-[2.4rem] leading-[0.95] font-black tracking-[-0.03em] md:text-[3.25rem] ${toneClass}`}>
                  {now.head}
                </p>
                <p key={`${now.id}-sub`} className="flap mt-2 text-lg font-semibold text-white/80">
                  {now.sub}
                </p>
              </div>

              {now.id === "refused" ? (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <p className="stamp -rotate-6 border-4 border-alert bg-ink/90 px-6 py-3 text-[2.4rem] font-black tracking-[0.04em] text-alert">REFUSED</p>
                </div>
              ) : null}

              {done ? (
                <button
                  type="button"
                  onClick={replay}
                  className="row-in absolute right-5 bottom-16 flex items-center gap-2 bg-yellow px-4 py-2.5 text-lg font-extrabold text-ink hover:bg-yellow-deep"
                >
                  <Pictogram name="reroute" size={28} />
                  Play again
                </button>
              ) : null}
            </div>

            <ol className="grid grid-cols-6 gap-1 bg-ink px-5 py-3" aria-label="Demo progress">
              {BEATS.map((b, i) => (
                <li key={b.id} className="flex flex-col gap-1.5">
                  <span className={`h-1.5 transition-colors duration-500 ${i <= beat ? (b.tone === "alert" ? "bg-alert" : "bg-yellow") : "bg-panel-2"}`} />
                  <span className={`hidden text-xs font-bold sm:block ${i === beat ? "text-white" : "text-white/40"}`}>{b.head.split(",")[0]}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1600px] px-4 py-16 md:px-8 lg:py-24">
        <ol className="grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
          {beats.map((b, i) => (
            <li key={b.head} className="row-in bg-ink p-6 lg:p-8" style={{ animationDelay: `${i * 120}ms` }}>
              <Pictogram name={b.picto} size={56} className="bg-yellow! text-ink!" />
              <h2 className="mt-6 text-[1.45rem] leading-tight font-extrabold">{b.head}</h2>
              <p className="mt-2 text-base leading-snug text-soft">{b.line}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="sign on-yellow">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-6 px-4 py-12 md:px-8">
          <p className="text-[2rem] leading-tight font-black tracking-[-0.02em] md:text-[2.4rem]">Watch it shop, live.</p>
          <Link href="/login" className="bg-ink px-5 py-3 text-xl font-extrabold text-white hover:bg-panel-2">
            Sign in
          </Link>
        </div>
      </section>

    </div>
  );
}
