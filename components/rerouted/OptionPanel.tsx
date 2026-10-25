"use client";

import { useEffect, useState } from "react";
import { clockHours, deadlineDelta, money, timeOnly } from "./format";
import { Pictogram } from "./Pictogram";
import { parseRules, type Offer } from "./types";

export interface Stamp {
  by: "agent" | "traveler";
  text: string;
}

// Short chip words for the rules that matter to a decision. The full reason is on hover.
const chipWord: Record<string, string> = {
  above_ask_threshold: "Over ask limit",
  free_option_exists: "Free option exists",
  misses_deadline: "Misses 9 AM",
  over_trip_cap: "Over cap",
  category_not_allowed: "Not allowed",
};

const AX_FROM = 8; // 8 PM tonight on the clockHours axis
const AX_TO = 29; // 5 PM tomorrow
const pct = (h: number) => Math.max(0, Math.min(100, ((h - AX_FROM) / (AX_TO - AX_FROM)) * 100));

/** How long the quoted price is held, from the offer's real expiry. Ticks only while shown. */
function PriceHold({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.floor((Date.parse(expiresAt) - now) / 1000);
  if (!Number.isFinite(left)) return null;
  if (left <= 0) return <p className="text-sm font-bold">Price expired</p>;
  return (
    <p className="text-sm font-bold tabular-nums">
      Price held {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
    </p>
  );
}

/** The route as a bar on the same axis as the corridor, with the 9:00 AM deadline as a post. */
function DeadlineBar({ dep, arr, before, onBlack = false }: { dep: number; arr: number; before: boolean; onBlack?: boolean }) {
  return (
    <div className="relative mt-3 h-3" aria-hidden="true">
      <div className={`absolute inset-x-0 top-1/2 h-px ${onBlack ? "bg-white/30" : "bg-ink/30"}`} />
      <div className={`bar-in absolute top-0 h-3 ${before ? (onBlack ? "bg-yellow" : "bg-ink") : onBlack ? "ring-2 ring-yellow ring-inset" : "ring-2 ring-ink ring-inset"}`} style={{ left: `${pct(dep)}%`, width: `${pct(arr) - pct(dep)}%` }} />
      <div className={`absolute -top-1.5 -bottom-1.5 w-1 ${onBlack ? "bg-white" : "bg-ink"}`} style={{ left: `${pct(21)}%` }} />
    </div>
  );
}

export function OptionPanel({
  offer,
  stamp,
  voided,
  busy,
  locked,
  onApprove,
}: {
  offer: Offer;
  stamp?: Stamp;
  voided?: { priceCents: number; text: string };
  busy: boolean;
  locked: boolean;
  onApprove: (o: Offer) => void;
}) {
  const rules = parseRules(offer.rulesJson).filter((r) => chipWord[r.id]);
  const hotel = offer.kind === "hotel";
  const dep = clockHours(offer.departs);
  const depET = dep !== null ? dep + 3 : null;
  const arrH = hotel || depET === null ? null : clockHours(offer.arrives, depET);
  const delta = arrH !== null ? deadlineDelta(arrH) : null;
  const booked = offer.status === "booked";
  const lead = offer.rank === 1;
  const free = offer.kind === "free_rebooking";

  // Once a flight is booked, every other choice closes, the hotel included: one quiet row, not gone.
  if (locked && !booked) {
    return (
      <article className="row-in board grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-x-3 px-4 py-3" aria-label={`Option ${offer.rank}, not needed`}>
        <span className="text-2xl font-black text-soft">{offer.rank}</span>
        <p className="truncate text-lg font-bold text-soft">{offer.title}</p>
        <p className="text-sm font-semibold text-soft">Not needed</p>
      </article>
    );
  }

  const times = hotel ? "Tonight, near the airport" : `${timeOnly(offer.departs)} to ${timeOnly(offer.arrives)}`;
  const price = offer.priceCents === 0 ? "Free" : money(offer.priceCents);
  const early = delta ? delta.text.replace(/ (before|after) \d{1,2}:\d{2} (AM|PM)$/, "") : "";

  return (
    <article
      className={`row-in relative grid grid-cols-[auto_1fr] gap-x-4 ${free ? "free board border-4 border-yellow" : "sign"} ${booked ? "outline-4 outline-white" : ""}`}
      style={{ animationDelay: `${offer.rank * 90}ms` }}
      aria-label={`Option ${offer.rank}: ${offer.title}`}
    >
      <div className={`flex flex-col items-start gap-2 pl-4 ${lead ? "py-4" : "py-3"}`}>
        <span className={`leading-[0.8] font-black tracking-[-0.04em] ${lead ? "text-[4.5rem]" : "text-[2rem]"}`}>{offer.rank}</span>
        {lead || free ? <Pictogram name={free ? "refund" : hotel ? "bed" : "depart"} size={40} className={free ? "bg-yellow! text-ink!" : ""} /> : null}
      </div>

      <div className={`min-w-0 pr-4 ${lead ? "py-4" : "py-3"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {free ? <p className="text-[2.4rem] leading-[0.95] font-black tracking-[-0.03em] text-yellow">Free rebooking</p> : null}
            <h3 className={`leading-tight font-extrabold tracking-[-0.01em] ${free ? "mt-1 text-base text-white" : lead ? "text-[1.45rem]" : "text-lg"}`}>{free ? offer.merchant : offer.title}</h3>
            <p className={`font-bold ${free ? "text-soft" : "text-yellow-soft"}`}>{times}</p>
          </div>
          <p className={`text-right leading-none font-black tracking-[-0.02em] ${free ? "hidden" : lead ? "text-[2rem]" : "text-[1.45rem]"}`}>
            <span key={offer.priceCents} className="flap inline-block">{price}</span>
            {voided ? <span className="mt-1 block text-base font-bold text-yellow-soft line-through decoration-2">{money(voided.priceCents)}</span> : null}
          </p>
        </div>

        {delta && arrH !== null && depET !== null ? (
          <>
            <DeadlineBar dep={depET} arr={arrH} before={delta.before} onBlack={free} />
            <p className={`mt-1.5 text-sm font-bold ${free ? "text-white" : ""}`}>{delta.before ? `Lands ${early} early` : `Lands ${early} late`}</p>
          </>
        ) : null}

        {lead && !booked ? <div className="mt-1">{<PriceHold expiresAt={offer.expiresAt} />}</div> : null}

        {lead && offer.claudeReason && !booked ? <p className="mt-2 line-clamp-2 max-w-[46ch] text-base leading-snug">{offer.claudeReason}</p> : null}

        {!booked && (lead || free) && rules.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Card rules that apply">
            {rules.map((r) => (
              <li key={r.id} title={r.reason} className={`px-1.5 py-0.5 text-xs font-bold ring-2 ring-inset ${free ? "ring-yellow text-yellow" : "ring-ink"}`}>
                {chipWord[r.id]}
              </li>
            ))}
          </ul>
        ) : null}

        {stamp ? (
          <p role="alert" className="stamp mt-3 flex items-center gap-3 bg-ink p-2.5 text-base leading-snug font-bold text-alert">
            <Pictogram name={stamp.by === "agent" ? "agent" : "closed"} size={32} className="bg-alert! text-ink!" />
            {stamp.text}
          </p>
        ) : null}

        {booked ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 bg-ink px-3 py-2 text-lg font-extrabold text-yellow">
              <Pictogram name="arrive" size={28} className="bg-yellow! text-ink!" />
              Booked
            </p>
            {voided ? <p className="text-sm font-bold">{money(voided.priceCents)} {voided.text === "quote" ? "quote" : "approval"} voided: price changed</p> : null}
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onApprove(offer)}
            className={`mt-3 flex w-full items-center gap-3 pl-2.5 ${free ? "bg-yellow text-ink! hover:bg-yellow-deep" : "bg-ink"} text-left font-extrabold text-white transition-[transform,background-color] duration-150 hover:bg-panel-2 active:scale-[0.985] disabled:cursor-wait ${lead ? "py-3 text-xl" : "py-2 text-lg"}`}
          >
            <Pictogram name="card" size={lead ? 36 : 30} className={free ? "" : "bg-yellow! text-ink!"} />
            {busy ? "Checking your card" : `Approve ${offer.priceCents === 0 ? "free rebooking" : price}`}
          </button>
        )}
      </div>
    </article>
  );
}

export function SetAside({ offers }: { offers: Offer[] }) {
  if (!offers.length) return null;
  return (
    <section aria-labelledby="set-aside" className="board border-t-4 border-alert">
      <h2 id="set-aside" className="flex items-center gap-3 px-4 pt-3 text-lg font-extrabold">
        <Pictogram name="closed" size={28} className="bg-alert! text-ink!" />
        Set aside
      </h2>
      <ul className="divide-y divide-rule px-4 pb-2">
        {offers.map((o) => {
          const block = parseRules(o.rulesJson).find((r) => r.tier === "BLOCK");
          return (
            <li key={o.offerId} className="row-in grid grid-cols-[1fr_auto] gap-x-4 py-3">
              <p className="text-lg font-bold">
                {o.title}
              </p>
              <p className="font-mono text-lg font-semibold text-soft line-through decoration-alert decoration-2">{money(o.priceCents)}</p>
              <p className="col-span-2 text-base leading-snug text-alert">{o.flagged ? "Its listing tried to instruct the agent" : block?.reason}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
