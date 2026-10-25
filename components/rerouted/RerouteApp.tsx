"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CorridorCanvas } from "@/components/three/CorridorCanvas";
import { CardObject } from "./CardObject";
import { ClaudeSaw } from "./ClaudeSaw";
import { CalmPanel, ClosedOptions, OptionCard, ReceiptPanel, SetAsideShelf, ShoppingPanel, type Stamp } from "./Focus";
import { Pictogram, type PictoName } from "./Pictogram";
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
    { id: "agent", key: "A", label: "Agent tries to buy", enabled: !!top && !flightBooked },
    { id: "price", key: "P", label: "Price moves", enabled: !!top && !flightBooked && top.priceCents !== NEW_PRICE },
  ];
  // The presenter's next key is marked, so nobody has to remember the order.
  const agentTried = !!top && (stamps[top.offerId]?.by === "agent" || steps.some((s) => s.kind === "refusal" && /agent tried/i.test(s.text)));
  const nextKey =
    trip?.status === "scheduled" ? "cancel" : top && !flightBooked && !agentTried ? "agent" : top && !flightBooked && top.priceCents !== NEW_PRICE ? "price" : flightBooked ? "reset" : null;

  const shopping = trip?.status === "canceled" && ranked.length === 0;
  const [view, setView] = useState<View>("trip");

  return (
    <div className="flex min-h-dvh bg-canvas text-fg lg:h-dvh lg:overflow-hidden">
      <Sidebar
        view={view}
        onView={setView}
        controls={controls}
        nextKey={nextKey}
        running={control}
        onRun={run}
        account={account}
        note={mode === "mock" ? `Mock data${source.fallbackReason ? `: ${source.fallbackReason}` : ""}` : null}
        receipts={receipts.length}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <SignBand trip={trip} offers={offers} />

        {notice || source.seatError ? (
          <p role="alert" className="mx-8 mb-3 rounded-lg border border-danger bg-danger/5 px-4 py-2 text-sm font-bold text-danger">
            {notice ?? `Could not take the traveler seat: ${source.seatError}`}
          </p>
        ) : null}

        <main className="min-h-0 flex-1 px-8 pb-8">
          {view === "trip" ? (
            <div className="grid h-full min-h-0 gap-6 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
              <div className="flex min-h-0 min-w-0 flex-col gap-6">
                <section aria-labelledby="corridor" className="flex min-h-[300px] flex-1 flex-col overflow-hidden rounded-xl bg-panel text-white">
                  <div className="flex items-center justify-between gap-4 px-5 pt-4">
                    <h2 id="corridor" className="text-[15px] font-bold whitespace-nowrap">
                      Every way home <span className="font-medium text-soft">· New York time</span>
                    </h2>
                    <button type="button" onClick={() => setView("claude")} className="rounded-md border border-white/20 px-2.5 py-1 text-[13px] font-semibold whitespace-nowrap hover:bg-white/10">
                      What Claude saw
                    </button>
                  </div>
                  <div className="relative min-h-0 flex-1">
                    <CorridorCanvas trip={trip} offers={offers} refusedPulse={pulse} />
                  </div>
                </section>

                <div className="grid shrink-0 gap-6 md:grid-cols-2">
                  <div className="card px-5 py-4">
                    <StepsList steps={steps} idle={trip?.status === "scheduled"} />
                  </div>
                  {!flightBooked && aside.length ? <SetAsideShelf offers={aside} /> : <CardMeter mandate={mandate} trip={trip} />}
                </div>
              </div>

              <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-1">
                {flightBooked && trip ? (
                  <>
                    <ReceiptPanel receipts={receipts} trip={trip} voids={shownVoids} offers={offers} />
                    <ClosedOptions offers={ranked.filter((o) => o.status !== "booked")} />
                  </>
                ) : ranked.length ? (
                  ranked.map((o, i) => (
                    <OptionCard key={o.offerId} offer={o} lead={i === 0} stamp={stamps[o.offerId]} voided={shownVoids[o.offerId]} busy={busy === o.offerId} onApprove={approve} />
                  ))
                ) : (
                  <div className="card p-5">{shopping ? <ShoppingPanel /> : <CalmPanel trip={trip} />}</div>
                )}
                {!flightBooked && aside.length ? <CardMeter mandate={mandate} trip={trip} /> : null}
              </div>
            </div>
          ) : view === "card" ? (
            <div className="grid max-w-4xl gap-8 md:grid-cols-[360px_1fr]">
              <div className="card p-5">
                <CardObject mandate={mandate} trip={trip} />
              </div>
              <div className="space-y-3 text-[15px] leading-relaxed text-muted">
                <h2 className="text-lg font-bold text-fg">How the card decides</h2>
                <p>Every option is checked against these rules inside the database before it is shown. Over the cap or outside the allowed categories, it is set aside. Above the ask limit, it waits for your tap.</p>
                <p>The agent can search and explain. It cannot approve a purchase; the database refuses it on the agent&apos;s identity.</p>
              </div>
            </div>
          ) : view === "activity" ? (
            <div className="card max-w-3xl px-6 py-5">
              <StepsList steps={steps} idle={trip?.status === "scheduled"} limit={50} />
            </div>
          ) : view === "claude" ? (
            <div className="card relative max-w-5xl overflow-hidden">
              <ClaudeSaw trip={trip} mandate={mandate} onClose={() => setView("trip")} inline />
            </div>
          ) : (
            <div className="max-w-xl">
              {receipts.length && trip ? (
                <ReceiptPanel receipts={receipts} trip={trip} voids={shownVoids} offers={offers} />
              ) : (
                <div className="card p-6">
                  <h2 className="text-lg font-bold">No receipt yet</h2>
                  <p className="mt-1 text-[15px] text-muted">Approve a way home on the Trip view and its receipt appears here.</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

type View = "trip" | "card" | "activity" | "claude" | "receipts";

/** The card's limit under one glance, like a bank app's spending bar. */
function CardMeter({ mandate, trip }: { mandate: { tripCapCents: number; askAboveCents: number } | null; trip: { spendCents: number } | null }) {
  const cap = mandate?.tripCapCents ?? 0;
  const spent = trip?.spendCents ?? 0;
  const pct = cap ? Math.min(100, (spent / cap) * 100) : 0;
  const d = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
  return (
    <section aria-label="Card limit" className="card px-5 py-4">
      <p className="flex items-baseline justify-between text-[15px]">
        <span className="font-bold">Travel card •••• 4242</span>
        <span className="tabular-nums">
          <span className="font-bold">{d(spent)}</span> <span className="text-muted">/ {d(cap)}</span>
        </span>
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-sunk" role="meter" aria-valuemin={0} aria-valuemax={cap / 100} aria-valuenow={spent / 100} aria-label="Spent against the trip cap">
        <div className="h-full rounded-full bg-fg transition-[width] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-[13px] text-muted">Asks above {mandate ? d(mandate.askAboveCents) : ""} · Airlines and hotels only · Simulated card</p>
    </section>
  );
}

const MENU: { id: View; label: string; picto: PictoName }[] = [
  { id: "trip", label: "Trip", picto: "reroute" },
  { id: "card", label: "Card and rules", picto: "card" },
  { id: "activity", label: "Agent activity", picto: "search" },
  { id: "claude", label: "What Claude saw", picto: "agent" },
  { id: "receipts", label: "Receipts", picto: "check" },
];

/** The menu, the seats, and the presenter's keys. One tinted item marks where you are. */
function Sidebar({
  view,
  onView,
  controls,
  nextKey,
  running,
  onRun,
  account,
  note,
  receipts,
}: {
  view: View;
  onView: (v: View) => void;
  controls: { id: string; key: string; label: string; enabled: boolean }[];
  nextKey: string | null;
  running: string | null;
  onRun: (id: string) => void;
  account?: ReactNode;
  note: string | null;
  receipts: number;
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-card px-4 py-6 lg:flex">
      <div className="flex items-center gap-2.5 px-2">
        <Pictogram name="reroute" size={32} label="Rerouted" className="rounded-lg" />
        <span className="text-lg font-extrabold">Rerouted</span>
      </div>

      <nav aria-label="Dashboard" className="mt-8 flex flex-col gap-1">
        {MENU.map((m) => {
          const on = view === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onView(m.id)}
              aria-current={on ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-2 py-2 text-left text-[15px] transition-colors ${on ? "bg-tint font-bold" : "font-medium text-muted hover:bg-sunk hover:text-fg"}`}
            >
              <Pictogram name={m.picto} size={30} className={`rounded-md ${on ? "bg-fg! text-yellow!" : "bg-sunk! text-fg!"}`} />
              {m.label}
              {m.id === "receipts" && receipts ? <span className="ml-auto rounded-full bg-fg px-2 text-xs leading-5 font-bold text-card">{receipts}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <div className="rounded-xl bg-sunk p-3 text-[13px]">
          <p className="flex items-center gap-2 font-bold">
            <Pictogram name="check" size={20} className="rounded bg-fg! text-card!" />
            You, traveler
          </p>
          <p className="mt-2 flex items-center gap-2 font-semibold text-muted" title="The agent's seat cannot approve a purchase. The database refuses it.">
            <Pictogram name="lock" size={20} className="rounded bg-card! text-fg!" />
            Agent, locked
          </p>
        </div>

        <div className="rounded-xl border border-line p-3">
          <p className="mb-2 text-[13px] font-bold">Presenter</p>
          <ul className="flex flex-col gap-1">
            {controls.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={!c.enabled || !!running}
                  onClick={() => onRun(c.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] disabled:opacity-40 ${nextKey === c.id ? "bg-tint font-bold" : "text-muted hover:bg-sunk"}`}
                >
                  <kbd className={`grid h-5 w-5 place-items-center rounded font-mono text-[11px] ${nextKey === c.id ? "bg-fg text-card" : "border border-line"}`}>{c.key}</kbd>
                  {running === c.id ? "Working" : c.label}
                </button>
              </li>
            ))}
          </ul>
          {note ? <p className="mt-2 text-xs text-muted">{note}</p> : null}
        </div>
        <div className="px-2">{account}</div>
      </div>
    </aside>
  );
}
