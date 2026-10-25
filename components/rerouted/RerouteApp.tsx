"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CorridorCanvas } from "@/components/three/CorridorCanvas";
import { CardObject } from "./CardObject";
import { CalmPanel, ClosedOptions, OptionCard, ReceiptPanel, SetAsideShelf, ShoppingPanel, type Stamp } from "./Focus";
import { Pictogram } from "./Pictogram";
import { SignBand } from "./SignBand";
import { StepsList } from "./StepsList";
import { LiveProvider, STDB_DB, useLive } from "./live";
import type { Offer, RerouteSource } from "./types";
import { useMock } from "./useRerouted";

const NEW_PRICE = 41200;

/**
 * Live when the browser has a database name, unless ?mock=1. If the live database sends no trip
 * within 8 seconds (not published yet, wrong name, offline), the page says so and runs the mock.
 */
export function RerouteApp({ account }: { account?: ReactNode }) {
  const [choice, setChoice] = useState<{ mode: "live" | "mock"; reason?: string } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("mock") === "1") setChoice({ mode: "mock" });
    else if (!STDB_DB) setChoice({ mode: "mock", reason: "No database is configured for this page." });
    else setChoice({ mode: "live" });
  }, []);
  const fallBack = useCallback((reason: string) => setChoice({ mode: "mock", reason }), []);
  if (!choice) return <div className="min-h-dvh bg-ink" />;
  if (choice.mode === "mock") return <MockApp reason={choice.reason} account={account} />;
  return (
    <LiveProvider>
      <LiveApp onFail={fallBack} account={account} />
    </LiveProvider>
  );
}

function MockApp({ reason, account }: { reason?: string; account?: ReactNode }) {
  return <RerouteView source={useMock(reason)} account={account} />;
}

function LiveApp({ onFail, account }: { onFail: (reason: string) => void; account?: ReactNode }) {
  const source = useLive();
  const hasTrip = !!source.state.trip;
  useEffect(() => {
    if (hasTrip) return;
    const id = setTimeout(() => onFail("The live database did not answer within 8 seconds."), 8000);
    return () => clearTimeout(id);
  }, [hasTrip, onFail]);
  return <RerouteView source={source} account={account} />;
}

function RerouteView({ source, account }: { source: RerouteSource; account?: ReactNode }) {
  const { state, actions, mode } = source;
  const { trip, mandate, offers, steps, receipts } = state;
  const [stamps, setStamps] = useState<Record<string, Stamp>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [control, setControl] = useState<string | null>(null);
  const [pulse, setPulse] = useState<{ offerId: string; n: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Approvals the database voided because the price moved. Kept after booking: nothing disappears.
  const [voids, setVoids] = useState<Record<string, { priceCents: number; text: string }>>({});

  // A refused approval rolls back, so only the browser that tapped saw it. Every screen can still
  // see the database's price-change step, so the old quote is shown as voided everywhere.
  const shownVoids: Record<string, { priceCents: number; text: string }> = { ...voids };
  for (const s of steps) {
    const m = /^(.+)'s price changed from \$([\d,]+) to/.exec(s.text);
    if (!m) continue;
    const o = offers.find((x) => x.merchant === m[1] && x.status !== "set_aside" && x.kind !== "hotel" && x.rank === 1) ?? offers.find((x) => x.merchant === m[1]);
    if (o && !shownVoids[o.offerId]) shownVoids[o.offerId] = { priceCents: Number(m[2]!.replace(/,/g, "")) * 100, text: "quote" };
  }

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
          setVoids({});
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
          // The traveler taps approve on the quote they saw, at the moment the airline moves the price.
          const seen = top.quoteHash;
          const was = top.priceCents;
          const moved = await actions.setPrice(top.offerId, NEW_PRICE);
          if (!moved.ok) {
            setNotice(moved.error);
            return;
          }
          setBusy(top.offerId);
          const r = await actions.approve(top.offerId, seen);
          setBusy(null);
          if (!r.ok) {
            stamp(top.offerId, { by: "traveler", text: r.error });
            setVoids((v) => ({ ...v, [top.offerId]: { priceCents: was, text: r.error } }));
          }
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
    { id: "cancel", key: "C", label: "Cancel flight", enabled: trip?.status === "scheduled" },
    { id: "agent", key: "A", label: "Agent buys", enabled: !!top && !flightBooked },
    { id: "price", key: "P", label: "Price moves", enabled: !!top && !flightBooked && top.priceCents !== NEW_PRICE },
  ];
  // The presenter's next key is marked, so nobody has to remember the order.
  const agentTried = !!top && (stamps[top.offerId]?.by === "agent" || steps.some((s) => s.kind === "refusal" && /agent tried/i.test(s.text)));
  const nextKey =
    trip?.status === "scheduled" ? "cancel" : top && !flightBooked && !agentTried ? "agent" : top && !flightBooked && top.priceCents !== NEW_PRICE ? "price" : flightBooked ? "reset" : null;

  const shopping = trip?.status === "canceled" && ranked.length === 0;

  return (
    <div className="flex min-h-dvh flex-col bg-ink lg:h-dvh lg:overflow-hidden">
      <TopBar trip={trip} account={account} controls={controls} nextKey={nextKey} running={control} onRun={run} note={mode === "mock" ? `Mock data${source.fallbackReason ? `: ${source.fallbackReason}` : ""}` : null} />
      <SignBand trip={trip} offers={offers} />

      <main className="grid min-h-0 flex-1 gap-6 p-4 md:p-6 lg:grid-cols-[280px_minmax(0,1fr)_420px] xl:grid-cols-[320px_minmax(0,1fr)_480px] xl:gap-8 xl:px-10">
        <div className="order-2 flex min-h-0 flex-col gap-6 lg:order-none">
          <CardObject mandate={mandate} trip={trip} />
          <StepsList steps={steps} idle={trip?.status === "scheduled"} />
          {notice || source.seatError ? (
            <p role="alert" className="mt-auto text-base font-bold text-alert">
              {notice ?? `Could not take the traveler seat: ${source.seatError}`}
            </p>
          ) : null}
        </div>

        <div className="order-3 flex min-h-0 min-w-0 flex-col gap-4 lg:order-none">
        <section aria-labelledby="corridor" className="board flex min-h-[300px] min-w-0 flex-1 flex-col">
          <div className="flex items-baseline justify-between gap-4 px-5 pt-4">
            <h2 id="corridor" className="text-lg font-extrabold">
              Every way home, against 9:00 AM
            </h2>
            <p className="text-base text-soft">New York time</p>
          </div>
          <div className="relative min-h-0 flex-1">
            <CorridorCanvas trip={trip} offers={offers} refusedPulse={pulse} />
          </div>
        </section>
        {!flightBooked ? <SetAsideShelf offers={aside} /> : null}
        </div>

        <div className="order-1 flex min-h-0 flex-col gap-3 lg:order-none lg:overflow-y-auto">
          {flightBooked && trip ? (
            <>
              <ReceiptPanel receipts={receipts} trip={trip} voids={shownVoids} />
              <ClosedOptions offers={ranked.filter((o) => o.status !== "booked")} />
            </>
          ) : ranked.length ? (
            <>
              {ranked.map((o, i) => (
                <OptionCard key={o.offerId} offer={o} lead={i === 0} stamp={stamps[o.offerId]} voided={shownVoids[o.offerId]} busy={busy === o.offerId} onApprove={approve} />
              ))}
            </>
          ) : shopping ? (
            <ShoppingPanel />
          ) : (
            <CalmPanel trip={trip} />
          )}
        </div>
      </main>
    </div>
  );
}

/** Where you are, who you are, and the presenter's keys. The agent's seat is shown locked. */
function TopBar({
  trip,
  account,
  controls,
  nextKey,
  running,
  onRun,
  note,
}: {
  trip: { route: string; flight: string } | null;
  account?: ReactNode;
  controls: { id: string; key: string; label: string; enabled: boolean }[];
  nextKey: string | null;
  running: string | null;
  onRun: (id: string) => void;
  note: string | null;
}) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-4 border-b border-rule px-4 md:px-6 xl:px-10">
      <span className="flex items-center gap-2.5">
        <Pictogram name="reroute" size={32} label="Rerouted" className="bg-white! text-ink!" />
        <span className="text-lg font-extrabold">Rerouted</span>
      </span>
      <span className="hidden text-base text-soft md:inline">{trip ? `${trip.flight}, ${trip.route}` : ""}</span>

      <span className="ml-2 hidden items-center gap-2 border border-rule px-2.5 py-1 text-sm font-bold sm:flex">
        <Pictogram name="check" size={18} className="bg-white! text-ink!" />
        You, traveler
      </span>
      <span className="hidden items-center gap-2 border border-rule px-2.5 py-1 text-sm font-bold text-soft sm:flex" title="The agent's seat cannot approve a purchase. The database refuses it.">
        <Pictogram name="lock" size={18} className="bg-panel-2!" />
        Agent, locked
      </span>

      {note ? <span className="hidden truncate text-sm text-soft lg:inline">{note}</span> : null}
      <nav aria-label="Presenter keys" className="ml-auto flex items-center gap-1">
        {controls.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={!c.enabled || !!running}
            onClick={() => onRun(c.id)}
            title={`${c.label} (${c.key})`}
            className={`flex items-center gap-1.5 px-2 py-1 text-sm font-semibold transition-colors disabled:opacity-40 ${nextKey === c.id ? "text-white" : "text-soft hover:text-white"}`}
          >
            <kbd className={`grid h-6 w-6 place-items-center font-mono text-xs ${nextKey === c.id ? "bg-white text-ink" : "border border-rule"}`}>{c.key}</kbd>
            <span className="hidden xl:inline">{running === c.id ? "Working" : c.label}</span>
          </button>
        ))}
        <span className="ml-2 border-l border-rule pl-3">{account}</span>
      </nav>
    </div>
  );
}
