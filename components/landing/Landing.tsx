"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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

/** Slides its content in from one side the first time it scrolls into view. */
function Reveal({ from, children, className = "" }: { from: "left" | "right"; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(window.location.search).has("static")) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`transition-[transform,opacity] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${shown ? "translate-x-0 opacity-100" : from === "left" ? "-translate-x-24 opacity-0" : "translate-x-24 opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}

/** The story, one sign per beat, alternating sides as you scroll. */
const story: { picto: PictoName; tone: "yellow" | "alert"; big: string; head: string; line: string }[] = [
  { picto: "refund", tone: "yellow", big: "Free", head: "Free first", line: "It checks the airline's free rebooking before it spends a dollar." },
  { picto: "card", tone: "yellow", big: "$600", head: "Your card decides", line: "Trip cap, ask-first limit and allowed categories, enforced in the database." },
  { picto: "agent", tone: "alert", big: "No", head: "The agent cannot pay itself", line: "Only your tap buys, at the exact price you saw." },
  { picto: "arrive", tone: "yellow", big: "$318", head: "Your refund, counted", line: "Every purchase leaves a receipt that cannot be quietly changed." },
];

export function Landing() {
  const { state, beat, pulse, done, replay } = useReplay();
  const now = BEATS[beat]!;
  const toneClass = now.tone === "alert" ? "text-alert" : now.tone === "yellow" ? "text-yellow" : "text-white";

  return (
    <div className="min-h-dvh overflow-x-hidden bg-ink text-white">
      <header className="sign on-yellow">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <Pictogram name="reroute" size={40} label="Rerouted" />
            <span className="text-2xl font-extrabold tracking-tight">Rerouted</span>
          </Link>
          <Link href="/login" className="bg-ink px-4 py-2 text-base font-extrabold text-white transition-colors hover:bg-panel-2">
            Sign in
          </Link>
        </div>
      </header>

      <section className="sign on-yellow border-b-4 border-ink">
        <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-4 pt-10 pb-16 md:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 lg:pt-14 lg:pb-20">
          <Reveal from="left">
            <h1 className="text-[3.25rem] leading-[0.92] font-black tracking-[-0.04em] [text-wrap:balance] md:text-[4.25rem] xl:text-[5.5rem]">Canceled? Rerouted.</h1>
            <p className="mt-5 max-w-[30ch] text-xl leading-snug font-semibold text-yellow-soft">An agent shops your way home inside your card&apos;s rules. You approve with one tap.</p>
            <Link
              href="/login"
              className="mt-8 inline-flex items-center gap-3 bg-ink py-3 pr-5 pl-3 text-lg font-extrabold text-white transition-[transform,background-color] hover:bg-panel-2 active:scale-[0.985]"
            >
              <Pictogram name="depart" size={32} className="bg-yellow! text-ink!" />
              Open the dashboard
            </Link>
          </Reveal>

          {/* The show: a caption band, then the corridor performing the beat. */}
          <Reveal from="right">
            <div className="board border-4 border-ink">
              <div className="flex min-h-[96px] items-center justify-between gap-4 border-b border-rule px-5 py-3">
                <div className="min-w-0">
                  <p key={now.id} className={`flap text-[2rem] leading-none font-black tracking-[-0.03em] ${toneClass}`}>
                    {now.head}
                  </p>
                  <p key={`${now.id}-sub`} className="flap mt-1.5 text-base font-semibold text-white/75">
                    {now.sub}
                  </p>
                </div>
                {now.id === "refused" ? (
                  <p className="stamp shrink-0 -rotate-6 border-[3px] border-alert px-3 py-1 text-xl font-black tracking-[0.04em] text-alert">REFUSED</p>
                ) : null}
              </div>

              <div className="relative aspect-[4/3] w-full sm:aspect-[16/10]">
                <CorridorCanvas trip={state.trip} offers={state.offers} refusedPulse={pulse} labelScale={0.72} />
                {done ? (
                  <button
                    type="button"
                    onClick={replay}
                    className="row-in absolute right-3 bottom-3 flex items-center gap-1.5 bg-yellow px-2.5 py-1.5 text-sm font-extrabold text-ink hover:bg-yellow-deep"
                  >
                    <Pictogram name="reroute" size={20} />
                    Play again
                  </button>
                ) : null}
              </div>

              <ol className="grid grid-cols-6 gap-1 border-t border-rule px-5 py-3" aria-label="Demo progress">
                {BEATS.map((b, i) => (
                  <li key={b.id}>
                    <span className={`block h-1.5 transition-colors duration-500 ${i <= beat ? (b.tone === "alert" ? "bg-alert" : "bg-yellow") : "bg-panel-2"}`} />
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1440px] flex-col gap-20 px-4 py-20 md:px-8 lg:gap-28 lg:py-28">
        {story.map((s, i) => {
          const left = i % 2 === 0;
          return (
            <Reveal key={s.head} from={left ? "left" : "right"}>
              <div className={`flex flex-col items-start gap-6 md:flex-row md:items-center md:gap-12 ${left ? "" : "md:flex-row-reverse md:text-right"}`}>
                <div className={`flex shrink-0 items-center gap-5 ${left ? "" : "md:flex-row-reverse"}`}>
                  <Pictogram name={s.picto} size={88} className={s.tone === "alert" ? "bg-alert! text-ink!" : "bg-yellow! text-ink!"} />
                  <p className={`text-[4.5rem] leading-none font-black tracking-[-0.04em] md:text-[6rem] ${s.tone === "alert" ? "text-alert" : "text-yellow"}`}>{s.big}</p>
                </div>
                <div className={`max-w-[32ch] ${left ? "" : "md:ml-auto"}`}>
                  <h2 className="text-[2rem] leading-tight font-black tracking-[-0.02em]">{s.head}</h2>
                  <p className="mt-2 text-lg leading-snug text-soft">{s.line}</p>
                </div>
              </div>
            </Reveal>
          );
        })}
      </section>

      <section className="sign on-yellow">
        <Reveal from="left">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-6 px-4 py-14 md:px-8">
            <p className="text-[2.4rem] leading-tight font-black tracking-[-0.03em]">Watch it shop, live.</p>
            <Link href="/login" className="bg-ink px-5 py-3 text-lg font-extrabold text-white hover:bg-panel-2">
              Sign in
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
