"use client";

import fixture from "@/data/fixtures/demo.json";
import { verifyReceipts } from "@/spacetimedb/src/core/receipt";
import { clockHours, clockOf, deadlineDelta, money, timeOnly } from "./format";
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
function whyRank(o: Offer, delta: ReturnType<typeof deadlineDelta> | null): string {
  const ask = parseRules(o.rulesJson).find((r) => r.tier === "ASK" && r.id !== "above_auto_ceiling");
  const place = o.kind === "hotel" ? "Hotels rank after flights" : delta?.before ? "Lands before your deadline" : o.priceCents === 0 ? "Costs nothing, but misses your deadline" : "Misses your deadline";
  return ask ? `${place}. ${ask.reason}` : `${place}.`;
}

function landing(o: Offer) {
  if (o.kind === "hotel") return null;
  const dep = clockHours(o.departs);
  if (dep === null) return null;
  const arr = clockHours(o.arrives, dep + 3);
  return arr === null ? null : deadlineDelta(arr);
}

/** Before anything goes wrong: the trip, in plain terms. */
export function CalmPanel({ trip }: { trip: Trip | null }) {
  return (
    <section aria-labelledby="calm-h" className="flex flex-col gap-5">
      <h2 id="calm-h" className="text-lg font-extrabold">
        Your trip
      </h2>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-4">
        <div>
          <p className="text-[4.25rem] leading-none font-black tracking-[-0.03em]">SFO</p>
          <p className="mt-1 text-lg text-soft">Departs {trip?.departs}</p>
        </div>
        <Pictogram name="depart" size={44} className="mb-2 bg-panel-2!" />
        <div className="text-right">
          <p className="text-[4.25rem] leading-none font-black tracking-[-0.03em]">JFK</p>
          <p className="mt-1 text-lg text-soft">Arrive by 9:00 AM</p>
        </div>
      </div>
      <dl className="divide-y divide-rule border-y border-rule text-lg">
        <div className="flex justify-between py-2">
          <dt className="text-soft">Flight</dt>
          <dd className="font-bold">{trip?.flight}</dd>
        </div>
        <div className="flex justify-between py-2">
          <dt className="text-soft">Fare paid</dt>
          <dd className="font-bold tabular-nums">{trip ? money(trip.fareCents) : ""}</dd>
        </div>
      </dl>
      <p className="text-lg leading-snug text-soft">If it is canceled, the agent checks the airline&apos;s free rebooking first, then shops inside your card&apos;s rules. Nothing is bought until you tap.</p>
    </section>
  );
}

/** While the agent shops: a designed waiting state, not an empty box. */
export function ShoppingPanel() {
  return (
    <section className="flex flex-col gap-3" aria-live="polite">
      <h2 className="text-lg font-extrabold">Shopping for you</h2>
      <p className="text-lg leading-snug text-soft">Free rebooking first, then paid flights and a hotel, ranked against 9:00 AM.</p>
    </section>
  );
}

/** One way home. The winner is larger and carries the one accent: its Approve button. */
export function OptionCard({
  offer,
  lead,
  stamp,
  voided,
  busy,
  onApprove,
}: {
  offer: Offer;
  lead: boolean;
  stamp?: Stamp;
  voided?: Void;
  busy: boolean;
  onApprove: (o: Offer) => void;
}) {
  const delta = landing(offer);
  const price = offer.priceCents === 0 ? "Free" : money(offer.priceCents);
  const times = offer.kind === "hotel" ? "Tonight, near SFO" : `${timeOnly(offer.departs)} to ${timeOnly(offer.arrives)}`;
  const misses = delta && !delta.before;

  return (
    <article className={`slide-in border bg-panel ${lead ? "border-white p-4" : "border-rule px-4 py-3"}`} style={{ animationDelay: `${offer.rank * 110}ms` }} aria-label={`Option ${offer.rank}: ${offer.title}`}>
      <div className="flex items-start gap-3">
        <span className={`leading-[0.85] font-black tabular-nums ${lead ? "text-[2.4rem]" : "text-[1.45rem] text-soft"}`}>{offer.rank}</span>
        <div className="min-w-0 flex-1">
          <h3 className={`truncate font-extrabold ${lead ? "text-[1.45rem] leading-tight" : "text-lg"}`}>{offer.title}</h3>
          <p className="flex items-baseline gap-2 text-base text-soft">
            <span>{times}</span>
            {delta ? <span className={`ml-2 font-bold ${misses ? "text-soft" : "text-white"}`}>{misses ? "misses 9:00 AM" : `${delta.text.replace(" before 9:00 AM", "")} early`}</span> : null}
            {!lead ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onApprove(offer)}
                className="ml-auto shrink-0 font-bold text-white underline decoration-rule underline-offset-4 hover:decoration-white disabled:cursor-wait"
              >
                {busy ? "Checking" : "Approve"}
              </button>
            ) : null}
          </p>
        </div>
        <p className={`text-right leading-none font-black tabular-nums ${lead ? "text-[2rem]" : "text-[1.45rem]"}`}>
          <span key={offer.priceCents} className="price-flip inline-block">{price}</span>
          {voided ? <span className="mt-1 block text-base font-bold text-soft line-through decoration-alert decoration-2">{money(voided.priceCents)}</span> : null}
        </p>
      </div>

      {lead ? (
        <p className="mt-2 truncate text-base" title={whyRank(offer, delta)}>
          <span className="font-bold">Why #1:</span> {whyRank(offer, delta)}
        </p>
      ) : null}
      {offer.claudeReason && (lead || offer.kind !== "hotel") ? (
        <p className={`mt-1.5 flex gap-2 ${lead ? "text-lg leading-snug" : "text-base text-soft"}`} title={offer.claudeReason}>
          <span className="mt-0.5 shrink-0 border border-rule px-1.5 text-xs leading-5 font-bold text-soft">Claude</span>
          <span className="line-clamp-1">{offer.claudeReason}</span>
        </p>
      ) : null}

      {stamp?.by === "agent" ? (
        <p role="alert" className="stamp mt-3 flex items-center gap-3 border-2 border-alert p-2.5 text-lg leading-snug font-bold text-alert">
          <Pictogram name="lock" size={32} className="bg-alert! text-ink!" />
          {stamp.text}
        </p>
      ) : null}

      {voided && offer.status !== "booked" ? (
        <p role="alert" className="stamp mt-3 border-2 border-alert p-3 text-lg leading-snug font-bold" title={voided.text !== "quote" ? `The database said: ${voided.text}` : undefined}>
          You approved {money(voided.priceCents)}. The price is now {money(offer.priceCents)}. That approval is void.
        </p>
      ) : stamp?.by === "traveler" ? (
        <p role="alert" className="stamp mt-3 border-2 border-alert p-2.5 text-lg font-bold text-alert">
          {stamp.text}
        </p>
      ) : null}

      {lead ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onApprove(offer)}
          className="mt-3 flex w-full items-center justify-center gap-3 bg-yellow py-3 text-xl font-black text-ink transition-[transform,background-color] duration-150 hover:bg-yellow-deep focus-visible:outline-white active:scale-[0.985] disabled:cursor-wait disabled:opacity-70"
        >
          {busy ? "Checking your card" : `Approve ${offer.priceCents === 0 ? "free rebooking" : price}`}
        </button>
      ) : null}
      {lead ? <p className="mt-1.5 text-center text-sm text-soft">Charges card •••• 4242 exactly {price}. Nothing else is bought.</p> : null}
    </article>
  );
}

/** Why each option was rejected. The hostile listing is quoted as a visible callout. */
export function SetAsideShelf({ offers }: { offers: Offer[] }) {
  if (!offers.length) return null;
  return (
    <section aria-labelledby="aside-h" className="slide-in board px-5 py-3" style={{ animationDelay: "600ms" }}>
      <h2 id="aside-h" className="mb-2 text-base font-extrabold text-soft">
        Set aside by your card&apos;s rules
      </h2>
      <ul className="grid gap-4 md:grid-cols-2">
        {offers.map((o) => {
          const block = parseRules(o.rulesJson).find((r) => r.tier === "BLOCK");
          const listing = listingOf.get(o.offerId);
          return (
            <li key={o.offerId}>
              <p className="flex items-baseline justify-between gap-3 text-base">
                <span className="truncate font-bold">{o.title}</span>
                <span className="font-bold text-soft tabular-nums line-through decoration-alert decoration-2">{money(o.priceCents)}</span>
              </p>
              {o.flagged && listing ? (
                <div className="mt-1 border-2 border-alert p-2.5">
                  <p className="text-sm font-bold text-alert">Claude caught it: the listing tried to give the agent orders</p>
                  <blockquote className="mt-1 text-base leading-snug text-white">&ldquo;{listing}&rdquo;</blockquote>
                </div>
              ) : (
                <p className="text-base text-alert">{o.flagged ? o.flagReason : block?.reason}</p>
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
    <section aria-labelledby="receipt-h" className="print flex flex-col gap-3 bg-white p-5 text-ink">
      <div className="flex items-baseline justify-between">
        <h2 id="receipt-h" className="text-lg font-extrabold">
          Receipt #{r.seq}
        </h2>
        <span className="text-sm font-bold">Simulated payment</span>
      </div>
      <div className="flex items-end justify-between gap-4 border-b-2 border-dashed border-ink/30 pb-3">
        <div>
          <p className="text-xl font-extrabold">{r.merchant}</p>
          <p className="text-base">
            Approved by you, card •••• {r.tokenLast4}, {clockOf(r.at)}
          </p>
          {v ? <p className="text-base font-bold">{money(v.priceCents)} approval voided: the price changed</p> : null}
        </div>
        <p className="text-[2.4rem] leading-none font-black tabular-nums">{money(r.amountCents)}</p>
      </div>
      <p className="text-base font-bold">
        {shown} options shown, #{chosen ?? 1} chosen{took ? `, ${took} from cancel to booked` : ""}. Free rebooking checked first.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
        <dt className="text-ink/70">Fingerprint</dt>
        <dd className="font-mono text-sm" title={r.hash}>{r.hash.slice(0, 16)}</dd>
        <dt className="text-ink/70">Linked to</dt>
        <dd className="font-mono text-sm" title={r.prevHash}>{/^0+$/.test(r.prevHash) ? "the start of the chain" : `#${r.seq - 1}, ${r.prevHash.slice(0, 16)}`}</dd>
      </dl>
      <p className={`text-base font-bold ${chain.ok ? "" : "text-alert"}`}>{chain.ok ? "Fingerprints match. This receipt has not been changed." : `Fingerprints do not match: ${chain.reason}`}</p>
      {trip.refundOwedCents ? (
        <p className="flex items-center gap-3 border-t-2 border-ink pt-3 text-xl font-black">
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
    <ul className="flex flex-col divide-y divide-rule border-y border-rule">
      {offers.map((o) => (
        <li key={o.offerId} className="flex justify-between gap-3 py-1.5 text-base text-soft">
          <span className="truncate">
            {o.rank}. {o.title}
          </span>
          <span>Not needed</span>
        </li>
      ))}
    </ul>
  );
}
