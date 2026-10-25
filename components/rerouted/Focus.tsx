"use client";

import fixture from "@/data/fixtures/demo.json";
import { verifyReceipts } from "@/spacetimedb/src/core/receipt";
import { airportsOf, arrivalDelta, clockOf, deadlineOf, money, roughly, timeOnly, timeSpan } from "./format";
import { Pictogram } from "./Pictogram";
import { parseRules, type Offer, type Receipt, type Trip } from "./types";

export interface Stamp {
  by: "agent" | "traveler";
  text: string;
}

export interface Void {
  priceCents: number;
  text: string;
}

/** The listing text the seeded offers were built from. Shown as untrusted, quoted text, never as instructions. */
const listingOf = new Map(fixture.offers.map((o) => [o.offerId, o.listingText]));

/** Why an option sits where it does: the ranking rule first, then the card rule that asks you. */
function whyRank(o: Offer, delta: ReturnType<typeof arrivalDelta>): string {
  const ask = parseRules(o.rulesJson).find((r) => r.tier === "ASK" && r.id !== "above_auto_ceiling");
  const place = o.kind === "hotel" ? "Hotels rank after flights" : delta?.before ? "Lands before your deadline" : o.priceCents === 0 ? "Costs nothing, but misses your deadline" : "Misses your deadline";
  return ask ? `${place}. ${ask.reason}` : `${place}.`;
}


/** Before anything goes wrong: the trip, in plain terms. */
export function CalmPanel({ trip }: { trip: Trip | null }) {
  const { from, to } = airportsOf(trip?.route);
  return (
    <section aria-labelledby="calm-h" className="flex flex-col gap-5">
      <h2 id="calm-h" className="text-[15px] font-extrabold">
        Your trip
      </h2>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-4">
        <div>
          <p className="display text-[2.75rem] leading-none">{from}</p>
          <p className="mt-1 text-[15px] text-muted">Departs {trip?.departs}</p>
        </div>
        <div className="mb-3 flex items-center gap-1.5 text-muted" aria-hidden>
          <span className="h-0 w-6 border-t-2 border-dashed border-line" />
          <Pictogram name="depart" size={26} className="rounded bg-fg! text-card!" />
          <span className="h-0 w-6 border-t-2 border-dashed border-line" />
        </div>
        <div className="text-right">
          <p className="display text-[2.75rem] leading-none">{to}</p>
          <p className="mt-1 text-[15px] text-muted">Arrive by {deadlineOf(trip?.deadlineText).label}</p>
        </div>
      </div>
      <dl className="divide-y divide-line border-y border-line text-[15px]">
        <div className="flex justify-between py-2">
          <dt className="text-muted">Flight</dt>
          <dd className="font-bold">{trip?.flight}</dd>
        </div>
        <div className="flex justify-between py-2">
          <dt className="text-muted">Fare paid</dt>
          <dd className="font-bold tabular-nums">{trip ? money(trip.fareCents) : ""}</dd>
        </div>
      </dl>
      <p className="text-[15px] leading-snug text-muted">If it is canceled, the agent searches real flights to {to}, ranks them against your deadline and checks each one against your card&apos;s rules. Nothing is bought until you tap.</p>
    </section>
  );
}

/** While the agent shops: a designed waiting state, not an empty box. */
export function ShoppingPanel({ trip }: { trip: Trip | null }) {
  return (
    <section className="flex flex-col gap-3" aria-live="polite">
      <h2 className="text-[15px] font-extrabold">Shopping for you</h2>
      <p className="text-[15px] leading-snug text-muted">Searching flights to {airportsOf(trip?.route).to} and ranking them against {deadlineOf(trip?.deadlineText).label}.</p>
    </section>
  );
}

/** The live flight search failed. The backend shows no options and buys nothing; say so, and offer a retry. */
export function SearchFailedPanel({ text, busy, onRetry }: { text: string; busy: boolean; onRetry: () => void }) {
  return (
    <section role="alert" className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-danger">
        <Pictogram name="closed" size={24} className="rounded bg-danger! text-white!" />
        The flight search failed
      </h2>
      <p className="text-[15px] leading-snug">{text}</p>
      <p className="text-[13px] text-muted">Nothing was bought. No made-up flights stand in for a failed search.</p>
      <button
        type="button"
        disabled={busy}
        onClick={onRetry}
        className="mt-1 self-start rounded-lg border border-fg px-4 py-2 text-[15px] font-bold hover:bg-sunk disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? "Searching again" : "Search again"}
      </button>
    </section>
  );
}

/** One way home. The winner is larger and carries the one accent: its Approve button. */
export function OptionCard({
  offer,
  trip,
  lead,
  stamp,
  voided,
  busy,
  onApprove,
}: {
  offer: Offer;
  trip: Trip | null;
  lead: boolean;
  stamp?: Stamp;
  voided?: Void;
  busy: boolean;
  onApprove: (o: Offer) => void;
}) {
  const delta = arrivalDelta(offer, trip);
  const by = deadlineOf(trip?.deadlineText).label;
  const price = offer.priceCents === 0 ? "Free" : money(offer.priceCents);
  const times = offer.kind === "hotel" ? "Tonight, near the airport" : timeSpan(offer.departs, offer.arrives);
  const misses = delta && !delta.before;

  return (
    <article className={`slide-in rounded-xl border bg-card ${lead ? "card-focus border-line p-5" : "border-line px-4 py-3"}`} style={{ animationDelay: `${offer.rank * 110}ms` }} aria-label={`Option ${offer.rank}: ${offer.title}`}>
      <div className="flex items-start gap-3">
        <span className={`display leading-[0.85] ${lead ? "text-[1.9rem]" : "text-lg text-muted"}`}>{offer.rank}</span>
        <div className="min-w-0 flex-1">
          <h3 className={`truncate font-extrabold ${lead ? "text-lg leading-tight" : "text-[15px]"}`}>{offer.title}</h3>
          <p className="flex items-baseline gap-2 text-sm text-muted">
            <span className="whitespace-nowrap">{times}</span>
            {delta ? <span className={`font-bold whitespace-nowrap ${misses ? "text-muted" : "text-fg"}`}>{misses ? `misses ${by}` : `${roughly(delta.text.replace(` before ${by}`, ""))} early`}</span> : null}
            {!lead ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onApprove(offer)}
                className="ml-auto shrink-0 font-bold text-fg underline decoration-line underline-offset-4 hover:decoration-fg disabled:cursor-wait"
              >
                {busy ? "Checking" : "Approve"}
              </button>
            ) : null}
          </p>
        </div>
        <p className={`display text-right leading-none ${lead ? "text-[1.9rem]" : "text-xl"}`}>
          <span key={offer.priceCents} className="price-flip inline-block">{price}</span>
          {voided ? <span className="mt-1 block text-sm font-bold text-muted line-through decoration-danger decoration-2">{money(voided.priceCents)}</span> : null}
        </p>
      </div>

      {lead ? (
        <p className="mt-2 text-sm leading-snug">
          <span className="font-bold">Why #1:</span> {whyRank(offer, delta)}
        </p>
      ) : null}
      {offer.claudeReason && (lead || offer.kind !== "hotel") ? (
        <p className={`mt-1.5 flex gap-2 ${lead ? "text-[15px] leading-snug" : "text-sm text-muted"}`} title={offer.claudeReason}>
          <span className="mt-0.5 shrink-0 border border-line px-1.5 text-xs leading-5 font-bold text-muted">Agent</span>
          <span className="line-clamp-1">{offer.claudeReason}</span>
        </p>
      ) : null}

      {stamp?.by === "agent" ? (
        <p role="alert" className="stamp mt-3 flex items-center gap-3 rounded-lg border border-danger bg-danger/5 p-2.5 text-[15px] leading-snug font-bold text-danger">
          <Pictogram name="lock" size={32} className="bg-danger! text-white!" />
          {stamp.text}
        </p>
      ) : null}

      {voided && offer.status !== "booked" ? (
        <p role="alert" className="stamp mt-3 rounded-lg border border-danger bg-danger/5 p-3 text-[15px] leading-snug font-bold" title={voided.text !== "quote" ? `The database said: ${voided.text}` : undefined}>
          <span className="mb-1 flex items-center gap-2 text-[13px] text-danger">
            <Pictogram name="clock" size={22} className="rounded bg-danger! text-white!" />
            Price changed after you approved
          </span>
          You approved {money(voided.priceCents)}. The price is now {money(offer.priceCents)}. That approval is void.
        </p>
      ) : stamp?.by === "traveler" ? (
        <p role="alert" className="stamp mt-3 rounded-lg border border-danger bg-danger/5 p-2.5 text-[15px] font-bold text-danger">
          {stamp.text}
        </p>
      ) : null}

      {lead ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onApprove(offer)}
          className="mt-3 flex w-full items-center justify-center gap-3 rounded-lg bg-yellow py-3 text-[17px] font-black text-ink transition-[transform,background-color] duration-150 hover:bg-yellow-deep focus-visible:outline-fg active:scale-[0.985] disabled:cursor-wait disabled:opacity-70"
        >
          {busy ? "Checking your card" : `Approve ${offer.priceCents === 0 ? "free rebooking" : price}`}
        </button>
      ) : null}
      {lead ? <p className="mt-1.5 text-center text-[13px] text-muted">Charges card •••• 4242 exactly {price}. Nothing else is bought.</p> : null}
    </article>
  );
}

/** Why each option was rejected. The hostile listing is quoted as a visible callout. */
export function SetAsideShelf({ offers }: { offers: Offer[] }) {
  if (!offers.length) return null;
  return (
    <section aria-labelledby="aside-h" className="slide-in card px-5 py-4" style={{ animationDelay: "600ms" }}>
      <h2 id="aside-h" className="mb-2 text-sm font-extrabold text-muted">
        Set aside by your card&apos;s rules
      </h2>
      <ul className="flex flex-col gap-3">
        {offers.map((o) => {
          const block = parseRules(o.rulesJson).find((r) => r.tier === "BLOCK");
          const listing = listingOf.get(o.offerId);
          return (
            <li key={o.offerId}>
              <p className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-bold">{o.title}</span>
                <span className="font-bold text-muted tabular-nums line-through decoration-danger decoration-2">{money(o.priceCents)}</span>
              </p>
              {o.flagged && listing ? (
                <div className="mt-1 rounded-lg border border-danger bg-danger/5 p-2.5">
                  <p className="text-[13px] font-bold text-danger">The agent caught it: the listing tried to give the agent orders</p>
                  <blockquote className="mt-1 text-sm leading-snug text-fg">&ldquo;{listing}&rdquo;</blockquote>
                </div>
              ) : (
                <p className="text-sm text-danger">{o.flagged ? o.flagReason : block?.reason}</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The ending: what was bought, by whom, with the proof and the refund. */
export function ReceiptPanel({ receipts, trip, voids, offers }: { receipts: Receipt[]; trip: Trip; voids: Record<string, Void>; offers: Offer[] }) {
  const r = receipts.at(-1);
  if (!r) return null;
  const chain = verifyReceipts(receipts);
  const v = voids[r.offerId];
  const shown = offers.filter((o) => o.rank > 0).length;
  const chosen = offers.find((o) => o.offerId === r.offerId)?.rank;
  const minutes = trip.canceledAt && trip.bookedAt ? Math.max(0, Math.round((Date.parse(trip.bookedAt) - Date.parse(trip.canceledAt)) / 1000)) : null;
  const took = minutes === null ? null : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
  return (
    <section aria-labelledby="receipt-h" className="print card card-focus flex flex-col gap-3 p-5">
      <div className="flex items-baseline justify-between">
        <h2 id="receipt-h" className="text-[15px] font-extrabold">
          Receipt #{r.seq}
        </h2>
        <span className="text-[13px] font-bold">Simulated payment</span>
      </div>
      <div className="flex items-end justify-between gap-4 border-b-2 border-dashed border-ink/30 pb-3">
        <div>
          <p className="text-[17px] font-extrabold">{r.merchant}</p>
          <p className="text-sm">
            Approved by you, card •••• {r.tokenLast4}, {clockOf(r.at)}
          </p>
          {v ? <p className="text-sm font-bold">{money(v.priceCents)} approval voided: the price changed</p> : null}
        </div>
        <p className="display text-[2.25rem] leading-none">{money(r.amountCents)}</p>
      </div>
      <p className="text-sm font-bold">
        {shown} options shown, #{chosen ?? 1} chosen{took ? `, ${took} from cancel to booked` : ""}.{offers.some((o) => o.priceCents === 0) ? " Free rebooking checked first." : ""}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Fingerprint</dt>
        <dd className="font-mono text-[13px]" title={r.hash}>{r.hash.slice(0, 16)}</dd>
        <dt className="text-muted">Linked to</dt>
        <dd className="font-mono text-[13px]" title={r.prevHash}>{/^0+$/.test(r.prevHash) ? "the start of the chain" : `#${r.seq - 1}, ${r.prevHash.slice(0, 16)}`}</dd>
      </dl>
      <p className={`text-sm font-bold ${chain.ok ? "" : "text-danger"}`}>{chain.ok ? "Fingerprints match. This receipt has not been changed." : `Fingerprints do not match: ${chain.reason}`}</p>
      {trip.refundOwedCents ? (
        <p className="flex items-center gap-3 border-t-2 border-ink pt-3 text-[17px] font-black">
          <Pictogram name="refund" size={36} />
          {money(trip.refundOwedCents)} refund owed for the canceled ticket
        </p>
      ) : null}
    </section>
  );
}

/** After booking, the other choices close into one quiet line each. */
export function ClosedOptions({ offers }: { offers: Offer[] }) {
  if (!offers.length) return null;
  return (
    <ul className="flex flex-col divide-y divide-line border-y border-line">
      {offers.map((o) => (
        <li key={o.offerId} className="flex justify-between gap-3 py-1.5 text-sm text-muted">
          <span className="truncate">
            {o.rank}. {o.title}
          </span>
          <span>Not needed</span>
        </li>
      ))}
    </ul>
  );
}
