"use client";

import { Pictogram, type PictoName } from "./Pictogram";
import type { AgentStep, Offer, Trip } from "./types";

interface Stop {
  id: string;
  word: string;
  picto: PictoName;
  done: boolean;
  alert?: boolean;
}

/**
 * The agent's run as a line of stops, like a route map on a train door: each stop lights when the
 * database records it. Derived only from real rows; nothing lights on a timer.
 */
export function AgentTrack({ trip, offers, steps }: { trip: Trip | null; offers: Offer[]; steps: AgentStep[] }) {
  const has = (re: RegExp, kind?: AgentStep["kind"]) => steps.some((s) => (!kind || s.kind === kind) && re.test(s.text));
  // Offers only exist after the agent has shopped, so once they arrive the shopping stops count as
  // done even if the step wording changes. The agent-blocked stop needs its own refusal row.
  const ranked = offers.length > 0;
  const claudeDown = steps.some((s) => s.kind === "error");
  const stops: Stop[] = [
    { id: "cancel", word: "Canceled", picto: "closed", done: !!trip?.canceledAt, alert: true },
    { id: "free", word: "Free check", picto: "refund", done: ranked || has(/free rebooking/i) },
    { id: "search", word: "Searched", picto: "depart", done: ranked || has(/^searched/i, "search") },
    {
      id: "listings",
      word: claudeDown ? "Claude offline" : "Listings",
      picto: "agent",
      done: ranked || claudeDown || has(/listing/i),
      alert: claudeDown,
    },
    { id: "ranked", word: "Ranked", picto: "reroute", done: ranked },
    { id: "blocked", word: "Agent blocked", picto: "closed", done: steps.some((s) => s.kind === "refusal" && /agent/i.test(s.text) && !/^flagged/i.test(s.text)), alert: true },
    { id: "booked", word: "Booked", picto: "arrive", done: !!trip?.bookedAt },
  ];
  const reached = stops.reduce((n, s, i) => (s.done ? i : n), -1);
  const fill = reached <= 0 ? 0 : (reached / (stops.length - 1)) * 100;

  return (
    <section aria-label="Agent progress" className="board px-4 py-5 md:px-6">
      <ol className="relative grid grid-cols-7 gap-1">
        {/* The line between stops fills as the run advances. */}
        <div className="absolute top-[18px] right-[7%] left-[7%] h-1 bg-panel-2" aria-hidden="true">
          <div className="h-full bg-yellow transition-[width] duration-700 ease-out" style={{ width: `${fill}%` }} />
        </div>
        {stops.map((s) => (
          <li key={s.id} className="relative flex flex-col items-center gap-2 text-center">
            <span key={`${s.id}-${s.done}`} className={s.done ? "stamp" : ""}>
              <Pictogram
                name={s.picto}
                size={40}
                label={`${s.word}${s.done ? ", done" : ", not yet"}`}
                className={s.done ? (s.alert ? "bg-alert! text-ink!" : "bg-yellow! text-ink!") : "bg-panel-2! text-soft!"}
              />
            </span>
            <span className={`text-xs leading-tight font-bold md:text-sm ${s.done ? "text-white" : "text-soft"}`}>{s.word}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
