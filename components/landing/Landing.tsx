"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { CorridorCanvas } from "@/components/three/CorridorCanvas";
import { createMockEngine } from "@/components/rerouted/mock";
import { Pictogram, type PictoName } from "@/components/rerouted/Pictogram";
import { airportsOf, arrivalDelta, deadlineOf, money, roughly, timeOnly } from "@/components/rerouted/format";
import fixture from "@/data/fixtures/demo.json";
import { rankOffers } from "@/spacetimedb/src/core/policy";
import { DEMO_TRIP } from "@/spacetimedb/src/core/seed";

type Engine = ReturnType<typeof createMockEngine>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One beat of the hero replay: what the caption says while the scene performs it. */
interface Beat {
  id: string;
  head: string;
  sub: string;
  tone: "white" | "yellow" | "alert";
}

// The replay's numbers come from the same data the mock engine plays: the seeded (real) flight and
// the recorded real search. Every option is ASK there (above $250, under the cap), so rank by kind,
// deadline and price, as the reducer does.
const { from: FROM, to: TO } = airportsOf(DEMO_TRIP.route);
const RANKS = rankOffers(fixture.offers.map((o) => ({ ...o, tier: "ASK" as const })));
const TOP = fixture.offers.find((o) => RANKS.get(o.offerId) === 1)!;
const PRICE_STEP = 2300; // the same simulated price move as the dashboard and demo-check
const MOVED = TOP.priceCents + PRICE_STEP;
const BY = deadlineOf(DEMO_TRIP.deadlineText).label;
const TOP_DELTA = arrivalDelta(TOP, DEMO_TRIP);

const BEATS: Beat[] = [
  { id: "scheduled", head: `${DEMO_TRIP.flight} to ${TO}`, sub: `Departs ${FROM} at ${DEMO_TRIP.departs}`, tone: "white" },
  { id: "canceled", head: "Canceled", sub: "The agent starts shopping", tone: "alert" },
  { id: "options", head: `${fixture.offers.length} ways home`, sub: `Ranked against your ${BY} deadline`, tone: "yellow" },
  { id: "refused", head: "Agent refused", sub: "It cannot approve its own purchase", tone: "alert" },
  { id: "price", head: `${money(TOP.priceCents)} to ${money(MOVED)}`, sub: "The price moved, so the old quote is void", tone: "yellow" },
  {
    id: "booked",
    head: `Booked, ${money(MOVED)}`,
    sub: `Lands ${timeOnly(TOP.arrives)}${TOP_DELTA?.before ? `, ${roughly(TOP_DELTA.text.replace(` before ${BY}`, ""))} early` : ""}`,
    tone: "yellow",
  },
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
      await e.actions.setPrice(top.offerId, top.priceCents + PRICE_STEP);
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
  { picto: "search", tone: "yellow", big: "Live", head: "Real flights, ranked", line: "It searches current fares across airlines and ranks them against the time you need to land." },
  { picto: "card", tone: "yellow", big: "$600", head: "Your card decides", line: "Trip cap, ask-first limit and allowed categories, enforced in the database." },
  { picto: "agent", tone: "alert", big: "No", head: "The agent cannot pay itself", line: "Only your tap buys, at the exact price you saw." },
  { picto: "arrive", tone: "yellow", big: money(DEMO_TRIP.fareCents), head: "Your refund, counted", line: "Every purchase leaves a receipt that cannot be quietly changed." },
];

/** The traveler at the gate, alone and with Rerouted, one moment per row. */
const gate: { moment: string; alone: string; with: string }[] = [
  { moment: "Finding a flight", alone: "One airline app at a time, while the gate line grows.", with: "Every flight to your destination, ranked against when you need to land." },
  { moment: "Spending", alone: "Easy to overpay in a panic.", with: "Your card's trip cap and ask-first limit, checked on every option." },
  { moment: "Buying", alone: "Hand an assistant your card and hope.", with: "Nothing is bought until you tap, at the exact price you saw." },
  { moment: "Afterwards", alone: "Hard to tell what you paid and what you are owed.", with: "A receipt for the new ticket, and the refund owed for the canceled one." },
];

/** Where it goes next for the traveler. Only the first stop is built. */
const route: { when: string; what: string; built: boolean }[] = [
  { when: "Now", what: "Real flights from Google Flights, ranked against your deadline, bought only on your tap.", built: true },
  { when: "Next", what: "The airline's own free rebooking and nearby hotels, from live sources.", built: false },
  { when: "Then", what: "Delays and missed connections, not only cancellations.", built: false },
  { when: "Later", what: "Real card controls in place of the simulated card.", built: false },
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
            <h1 className="[text-wrap:balance]">
              <span className="block text-[3.25rem] leading-[0.92] font-black tracking-[-0.04em] md:text-[4.25rem] xl:text-[5.5rem]">Flight canceled?</span>
              <span className="mt-5 block max-w-[26ch] text-2xl leading-snug font-bold md:text-[2rem]">Rerouted finds your way home, and you approve with one tap!</span>
            </h1>
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

      {/* Who it is for: one traveler, the same four moments alone and with Rerouted. */}
      <section aria-labelledby="who-h" className="mx-auto max-w-[1440px] px-4 pb-24 md:px-8 lg:pb-32">
        <Reveal from="left">
          <h2 id="who-h" className="max-w-[20ch] text-[2.4rem] leading-[1.02] font-black tracking-[-0.03em] md:text-[3.25rem]">
            Built for one person: the traveler stuck at the gate.
          </h2>
        </Reveal>

        <div className="mt-10 hidden grid-cols-[11rem_1fr_1fr] gap-4 text-sm font-extrabold tracking-[0.02em] text-soft uppercase md:grid">
          <span />
          <span className="flex items-center gap-2">
            <Pictogram name="closed" size={28} className="bg-panel-2! text-soft!" />
            Alone at the gate
          </span>
          <span className="flex items-center gap-2 text-yellow">
            <Pictogram name="reroute" size={28} className="bg-yellow! text-ink!" />
            With Rerouted
          </span>
        </div>

        <ol className="mt-4 flex flex-col gap-3">
          {gate.map((g, i) => (
            <li key={g.moment}>
              <Reveal from={i % 2 === 0 ? "left" : "right"} className="grid gap-3 md:grid-cols-[11rem_1fr_1fr] md:gap-4">
                <p className="flex items-center gap-3 text-lg font-extrabold md:flex-col md:items-start md:justify-center md:gap-1">
                  <span className="font-mono text-sm text-soft">0{i + 1}</span>
                  {g.moment}
                </p>
                <p className="board flex items-start gap-3 border border-rule p-4 text-lg leading-snug text-soft">
                  <span className="sr-only">Alone at the gate: </span>
                  <span aria-hidden className="mt-2 h-0.5 w-4 shrink-0 bg-alert" />
                  <span className="line-through decoration-white/25">{g.alone}</span>
                </p>
                <p className="sign on-yellow flex items-start gap-3 p-4 text-lg leading-snug font-bold">
                  <span className="sr-only">With Rerouted: </span>
                  <Pictogram name="check" size={24} className="mt-0.5 shrink-0" />
                  {g.with}
                </p>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      {/* What comes next, drawn as the route ahead: the first stop is built, the rest are planned. */}
      <section aria-labelledby="next-h" className="border-t border-rule">
        <div className="mx-auto max-w-[1440px] px-4 py-20 md:px-8 lg:py-28">
          <Reveal from="right">
            <h2 id="next-h" className="text-[2.4rem] leading-tight font-black tracking-[-0.03em] md:text-[3.25rem]">
              The route ahead
            </h2>
            <p className="mt-2 text-lg text-soft">One stop is built. The others are planned, for the same traveler.</p>
          </Reveal>

          <ol className="relative mt-12 grid gap-10 md:grid-cols-4 md:gap-6">
            <span aria-hidden className="absolute top-0 bottom-0 left-[15px] w-1 bg-panel-2 md:top-[15px] md:right-0 md:bottom-auto md:left-0 md:h-1 md:w-auto" />
            <span aria-hidden className="absolute top-0 left-[15px] h-[calc(25%-1rem)] w-1 bg-yellow md:top-[15px] md:h-1 md:w-[12.5%]" />
            {route.map((r, i) => (
              <li key={r.when} className="relative">
                <Reveal from={i % 2 === 0 ? "left" : "right"} className="flex gap-5 md:flex-col md:gap-4">
                  <span
                    aria-hidden
                    className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center border-4 ${r.built ? "border-yellow bg-yellow" : "border-panel-2 bg-ink"}`}
                  >
                    {r.built ? <span className="h-2 w-2 bg-ink" /> : null}
                  </span>
                  <div>
                    <p className={`text-[1.75rem] leading-none font-black tracking-[-0.02em] ${r.built ? "text-yellow" : "text-white"}`}>
                      {r.when}
                      {r.built ? <span className="ml-3 bg-yellow px-2 py-0.5 align-middle text-sm font-extrabold tracking-normal text-ink">Built</span> : null}
                    </p>
                    <p className="mt-2 max-w-[30ch] text-lg leading-snug text-soft">{r.what}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
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
