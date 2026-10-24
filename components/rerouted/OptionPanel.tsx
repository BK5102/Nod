"use client";

import { clockHours, deadlineDelta, money, timeOnly } from "./format";
import { Pictogram } from "./Pictogram";
import { parseRules, type Offer } from "./types";

export interface Stamp {
  by: "agent" | "traveler";
  text: string;
}

const tierWords = { AUTO: "Within your auto-buy limit", ASK: "Needs your approval", BLOCK: "Blocked by your card's rules" } as const;

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
  const rules = parseRules(offer.rulesJson);
  const hotel = offer.kind === "hotel";
  const depH = clockHours(offer.departs);
  const arrH = hotel ? null : clockHours(offer.arrives, depH !== null ? depH + 3 : 0);
  const delta = arrH !== null ? deadlineDelta(arrH) : null;
  const booked = offer.status === "booked";
  // Once a flight is booked, every other choice closes, the hotel included.
  const dim = locked && !booked;

  if (dim) {
    // Once a flight is booked, the other flights close: they shrink to one board row, not vanish.
    return (
      <article className="row-in board grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-x-3 px-4 py-3" aria-label={`Option ${offer.rank}, not needed`}>
        <span className="text-2xl font-black text-soft">{offer.rank}</span>
        <p className="text-lg font-bold text-soft">
          {offer.title}
        </p>
        <p className="text-sm font-semibold text-soft">Not needed now</p>
      </article>
    );
  }

  return (
    <article
      className={`row-in relative grid grid-cols-[auto_1fr] gap-x-4 transition-opacity duration-500 ${booked ? "sign outline-4 outline-offset-0 outline-white" : "sign"}`}
      style={{ animationDelay: `${offer.rank * 90}ms` }}
      aria-label={`Option ${offer.rank}: ${offer.merchant} ${offer.title}`}
    >
      {/* Rank numeral and pictogram stand where a gate number would. */}
      <div className="flex flex-col items-start gap-2 py-4 pl-4">
        <span className="text-[4.5rem] leading-[0.8] font-black tracking-[-0.04em]">{offer.rank}</span>
        <Pictogram name={hotel ? "bed" : "depart"} size={44} />
      </div>

      <div className="min-w-0 py-4 pr-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[1.45rem] leading-tight font-extrabold tracking-[-0.01em] [text-wrap:balance]">{offer.title}</h3>
          </div>
          <p className="text-right text-[2rem] leading-none font-black tracking-[-0.02em]">
            <span key={offer.priceCents} className="flap inline-block">{offer.priceCents === 0 ? "Free" : money(offer.priceCents)}</span>
            {voided ? <span className="mt-1 block text-base font-bold text-yellow-soft line-through decoration-2">{money(voided.priceCents)}</span> : null}
          </p>
        </div>

        <p className="mt-2 text-lg font-bold">
          {hotel
            ? [offer.departs, offer.arrives].filter(Boolean).join(" · ") || "Tonight, near SFO"
            : `${offer.departs.replace(/^tomorrow /, "Tomorrow ")} SFO  ·  lands ${timeOnly(offer.arrives)} JFK`}
        </p>
        {delta ? (
          <p className={`mt-1 inline-flex items-center gap-2 px-2 py-0.5 text-base font-bold ${delta.before ? "bg-ink text-yellow" : "bg-transparent text-ink ring-2 ring-ink ring-inset"}`}>
            {delta.text}
          </p>
        ) : null}

        {offer.claudeReason ? <p className="mt-3 max-w-[48ch] text-base leading-snug">{offer.claudeReason}</p> : null}

        {voided && booked ? (
          <p className="mt-3 flex items-start gap-3 bg-ink p-3 text-base leading-snug font-bold text-alert">
            <Pictogram name="closed" size={32} className="bg-alert! text-ink!" />
            Void: your {money(voided.priceCents)} approval was refused because the price changed. You approved {money(offer.priceCents)} after.
          </p>
        ) : null}

        {booked ? null : (
        <div className="mt-3 border-t-2 border-ink/80 pt-2">
          <p className="text-sm font-bold">{tierWords[offer.tier]}</p>
          <ul className="mt-1 space-y-0.5">
            {rules.map((r) => (
              <li key={r.id} className="text-sm leading-snug text-yellow-soft">
                {r.reason}
              </li>
            ))}
          </ul>
        </div>
        )}

        {stamp ? (
          <div role="alert" className="stamp mt-3 flex items-start gap-3 bg-ink p-3 text-white">
            <Pictogram name={stamp.by === "agent" ? "agent" : "closed"} size={36} className="bg-alert! text-ink!" />
            <div>
              <p className="text-sm font-semibold text-soft">{stamp.by === "agent" ? "The agent tried to buy this itself" : "Your approval was not accepted"}</p>
              <p className="text-base leading-snug font-bold text-alert">{stamp.text}</p>
            </div>
          </div>
        ) : null}

        {booked ? (
          <p className="mt-3 flex items-center gap-3 bg-ink px-3 py-3 text-lg font-extrabold text-yellow">
            <Pictogram name="arrive" size={36} className="bg-yellow! text-ink!" />
            Booked and paid. Receipt below.
          </p>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onApprove(offer)}
            className="mt-3 flex w-full items-center justify-between gap-3 bg-ink py-3 pr-4 pl-3 text-left text-xl font-extrabold text-white transition-[transform,background-color] duration-150 hover:bg-panel-2 active:scale-[0.985] disabled:cursor-wait disabled:opacity-60"
          >
            <span className="flex items-center gap-3">
              <Pictogram name="card" size={36} className="bg-yellow! text-ink!" />
              {busy ? "Checking your card's rules" : `Approve ${offer.priceCents === 0 ? "free rebooking" : money(offer.priceCents)}`}
            </span>
            <span className="text-sm font-semibold text-soft">one tap</span>
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
      <h2 id="set-aside" className="flex items-center gap-3 px-4 pt-4 text-xl font-extrabold">
        <Pictogram name="closed" size={36} className="bg-alert! text-ink!" />
        Set aside: your card would not allow these
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
              <p className="col-span-2 text-base leading-snug text-alert">{o.flagged ? o.flagReason : block?.reason}</p>
              {o.flagged ? <p className="col-span-2 text-sm text-soft">Flagged by Claude from the listing text. A flag can only raise the tier.</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
