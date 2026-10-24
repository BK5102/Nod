"use client";

import { useCallback, useEffect, useState } from "react";
import { CorridorCanvas } from "@/components/three/CorridorCanvas";
import { OptionPanel, SetAside, type Stamp } from "./OptionPanel";
import { Board, MandateSign, ReceiptSlip } from "./Panels";
import { SignBand } from "./SignBand";
import { LiveProvider, STDB_DB, useLive } from "./live";
import type { Offer, RerouteSource } from "./types";
import { useMock } from "./useRerouted";

const NEW_PRICE = 41200;

/**
 * Live when the browser has a database name, unless ?mock=1. If the live database sends no trip
 * within 8 seconds (not published yet, wrong name, offline), the page says so and runs the mock.
 */
export function RerouteApp() {
  const [choice, setChoice] = useState<{ mode: "live" | "mock"; reason?: string } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("mock") === "1") setChoice({ mode: "mock" });
    else if (!STDB_DB) setChoice({ mode: "mock", reason: "No database is configured for this page." });
    else setChoice({ mode: "live" });
  }, []);
  const fallBack = useCallback((reason: string) => setChoice({ mode: "mock", reason }), []);
  if (!choice) return <div className="min-h-dvh bg-ink" />;
  if (choice.mode === "mock") return <MockApp reason={choice.reason} />;
  return (
    <LiveProvider>
      <LiveApp onFail={fallBack} />
    </LiveProvider>
  );
}

function MockApp({ reason }: { reason?: string }) {
  return <RerouteView source={useMock(reason)} />;
}

function LiveApp({ onFail }: { onFail: (reason: string) => void }) {
  const source = useLive();
  const hasTrip = !!source.state.trip;
  useEffect(() => {
    if (hasTrip) return;
    const id = setTimeout(() => onFail("The live database did not answer within 8 seconds."), 8000);
    return () => clearTimeout(id);
  }, [hasTrip, onFail]);
  return <RerouteView source={source} />;
}

function RerouteView({ source }: { source: RerouteSource }) {
  const { state, actions, mode } = source;
  const { trip, mandate, offers, steps, receipts } = state;
  const [stamps, setStamps] = useState<Record<string, Stamp>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [control, setControl] = useState<string | null>(null);
  const [pulse, setPulse] = useState<{ offerId: string; n: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const ranked = offers.filter((o) => o.rank > 0).sort((a, b) => a.rank - b.rank);
  const aside = offers.filter((o) => o.rank === 0);
  const top = ranked[0];
  const flightBooked = offers.some((o) => o.status === "booked" && o.kind !== "hotel");

  const stamp = (offerId: string, s: Stamp | null) =>
    setStamps((prev) => {
      const next = { ...prev };
      if (s) next[offerId] = s;
      else delete next[offerId];
      return next;
    });

  const approve = useCallback(
    async (o: Offer, quoteHash = o.quoteHash) => {
      setBusy(o.offerId);
      const r = await actions.approve(o.offerId, quoteHash);
      setBusy(null);
      stamp(o.offerId, r.ok ? null : { by: "traveler", text: r.error });
    },
    [actions],
  );

  const run = useCallback(
    async (name: string) => {
      if (control) return;
      setControl(name);
      setNotice(null);
      try {
        if (name === "reset") {
          setStamps({});
          await actions.reset();
        } else if (name === "cancel") {
          const r = await actions.cancel();
          if (!r.ok) setNotice(r.error);
        } else if (name === "agent" && top) {
          const r = await actions.agentTryApprove(top.offerId);
          if (!r.ok) {
            stamp(top.offerId, { by: "agent", text: r.error });
            setPulse({ offerId: top.offerId, n: Date.now() });
          }
        } else if (name === "price" && top && top.priceCents !== NEW_PRICE) {
          // Sam taps approve on the quote they saw, at the moment the airline moves the price.
          const seen = top.quoteHash;
          await actions.setPrice(top.offerId, NEW_PRICE);
          await approve(top, seen);
        }
      } finally {
        setControl(null);
      }
    },
    [actions, approve, control, top],
  );

  // Rehearsal aid: ?to=options|agent|price|booked fast-forwards the demo to that beat on load.
  const [to] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("to")));
  const [played, setPlayed] = useState(false);
  useEffect(() => {
    if (!to || played) return;
    setPlayed(true);
    (async () => {
      const order = ["options", "agent", "price", "booked"];
      const upto = order.indexOf(to);
      if (upto < 0) return;
      await actions.cancel();
    })();
  }, [to, played, actions]);
  useEffect(() => {
    if (!to || !top || control) return;
    const upto = ["options", "agent", "price", "booked"].indexOf(to);
    const agentDone = stamps[top.offerId]?.by === "agent" || top.priceCents === NEW_PRICE;
    if (upto >= 1 && !agentDone) run("agent");
    else if (upto >= 2 && top.priceCents !== NEW_PRICE) setTimeout(() => run("price"), 600);
    else if (upto >= 3 && !flightBooked && top.priceCents === NEW_PRICE && !busy) setTimeout(() => approve(top), 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, top?.offerId, top?.priceCents, stamps, control, flightBooked]);

  // Presenter keys: R reset, C cancel, A agent tries to buy, P price moves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest("input,textarea,button")) return;
      const map: Record<string, string> = { r: "reset", c: "cancel", a: "agent", p: "price" };
      const name = map[e.key.toLowerCase()];
      if (name) run(name);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run]);

  const controls = [
    { id: "reset", key: "R", label: "Reset", enabled: true },
    { id: "cancel", key: "C", label: "Cancel the flight", enabled: trip?.status === "scheduled" },
    { id: "agent", key: "A", label: "Agent tries to buy", enabled: !!top && !flightBooked },
    { id: "price", key: "P", label: "Price moves as Sam taps approve", enabled: !!top && !flightBooked && top.priceCents !== NEW_PRICE },
  ];

  return (
    <div className="min-h-dvh bg-ink pb-28">
      <SignBand trip={trip} offers={offers} />

      {/* Phone order: corridor, choices, board. Desktop: corridor and board left, choices right. */}
      <main className="mx-auto grid max-w-[1600px] gap-4 px-4 pt-4 md:px-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(380px,1fr)] lg:grid-rows-[auto_1fr] lg:gap-6">
          <section aria-labelledby="corridor" className="board min-w-0 lg:col-start-1 lg:row-start-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 pt-3 md:px-6">
              <h2 id="corridor" className="text-xl font-extrabold">
                Every way home, against your deadline
              </h2>
              <p className="text-sm text-soft">Each arc runs from takeoff to landing. Under the yellow frame means you make it.</p>
            </div>
            <div className="relative h-[260px] sm:h-[360px] lg:h-[440px]">
              <CorridorCanvas trip={trip} offers={offers} refusedPulse={pulse} />
            </div>
          </section>
          <div className="min-w-0 lg:col-start-1 lg:row-start-2 lg:self-start max-lg:order-last">
            <Board steps={steps} live={mode === "live"} />
          </div>

        <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {ranked.length ? (
            <section aria-labelledby="choices" className="flex flex-col gap-3">
              <h2 id="choices" className="sr-only">
                Choices ahead
              </h2>
              {ranked.map((o) => (
                <OptionPanel key={o.offerId} offer={o} stamp={stamps[o.offerId]} busy={busy === o.offerId} locked={flightBooked} onApprove={approve} />
              ))}
            </section>
          ) : (
            <section className="sign on-yellow p-5">
              <h2 className="text-[1.75rem] leading-tight font-black tracking-[-0.01em]">
                {trip?.status === "canceled" ? "Shopping for you now" : "If this flight is canceled, your ways home appear here"}
              </h2>
              <p className="mt-2 max-w-[44ch] text-lg text-yellow-soft">
                {trip?.status === "canceled"
                  ? "Free rebooking first, then paid flights and a hotel, ranked against 9:00 AM inside your card's rules."
                  : "Ranked in under 10 seconds. Nothing is bought until you approve it, at the exact price you saw."}
              </p>
            </section>
          )}

          {receipts.length && trip ? <ReceiptSlip receipts={receipts} trip={trip} /> : null}
          <SetAside offers={aside} />
          {mandate && trip ? <MandateSign mandate={mandate} trip={trip} /> : null}
        </div>
      </main>

      <footer className="mx-auto mt-8 max-w-[1600px] px-4 md:px-8">
        <div className="grid gap-4 border-t border-rule pt-5 text-base text-soft md:grid-cols-[auto_1fr_1fr] md:gap-10">
          <p className="text-lg font-extrabold text-white">Rerouted is a working prototype.</p>
          <p>
            <span className="font-bold text-white">Real:</span> the card&apos;s rules, tiers and ranking, the refusal of the agent, the purchase bound to the exact quote,
            the hash-chained receipts, and Claude&apos;s reasons and flags.
          </p>
          <p>
            <span className="font-bold text-white">Simulated:</span> the cancellation, the flights and hotels (fictional names), the card token and the payment. No Visa API is
            called and no money moves.{" "}
            {mode === "mock" ? `This page is running on mock data${source.fallbackReason ? `: ${source.fallbackReason}` : "."}` : null}
            {source.seatError ? ` Could not take the traveler seat: ${source.seatError}` : null}
          </p>
        </div>
      </footer>

      <nav aria-label="Demo controls" className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-yellow bg-ink/95 md:inset-x-auto md:bottom-4 md:left-4 md:border-2">
        <div className="flex items-center gap-1 overflow-x-auto px-2 py-2">
          <p className="mr-2 hidden shrink-0 px-2 text-xs leading-tight text-soft md:block">
            Demo controls
            <br />
            simulated events
          </p>
          {controls.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={!c.enabled || !!control}
              onClick={() => run(c.id)}
              className="flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-bold text-white hover:bg-panel-2 disabled:text-white/35 disabled:hover:bg-transparent"
            >
              <kbd className="grid h-6 w-6 place-items-center bg-yellow font-mono text-xs text-ink">{c.key}</kbd>
              {control === c.id ? "Working" : c.label}
            </button>
          ))}
        </div>
        {notice ? <p className="px-4 pb-2 text-sm text-alert">{notice}</p> : null}
      </nav>
    </div>
  );
}
