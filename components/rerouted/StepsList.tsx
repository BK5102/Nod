"use client";

import { clockOf } from "./format";
import { Pictogram, type PictoName } from "./Pictogram";
import type { AgentStep } from "./types";

const marker: Record<AgentStep["kind"], { picto: PictoName; cls: string; word: string }> = {
  info: { picto: "clock", cls: "bg-panel-2! text-white!", word: "Note" },
  search: { picto: "search", cls: "bg-panel-2! text-white!", word: "Searching" },
  decision: { picto: "check", cls: "bg-white! text-ink!", word: "Decided" },
  refusal: { picto: "lock", cls: "bg-alert! text-ink!", word: "Refused" },
  error: { picto: "closed", cls: "bg-alert! text-ink!", word: "Error" },
};

const ROWS = 3;

/**
 * The agent's steps as plain lines, straight from the step rows. A fixed number of slots, so new
 * rows never push the layout. Each kind has its own marker; refusals and errors read in red.
 */
export function StepsList({ steps, idle }: { steps: AgentStep[]; idle: boolean }) {
  const rows = steps.slice(-ROWS);
  return (
    <section aria-labelledby="steps-h" className="flex min-h-0 flex-1 flex-col">
      <h2 id="steps-h" className="mb-3 text-lg font-extrabold">
        What the agent did
      </h2>
      {idle && rows.length === 0 ? (
        <p className="text-lg leading-snug text-soft">The agent is idle. It starts shopping the moment your flight is canceled.</p>
      ) : (
        <ol className="flex flex-col gap-2.5" aria-live="polite">
          {rows.map((s) => {
            const m = marker[s.kind];
            const red = s.kind === "refusal" || s.kind === "error";
            return (
              <li key={s.id} className="row-in grid grid-cols-[auto_1fr] items-start gap-3">
                <Pictogram name={m.picto} size={28} label={m.word} className={m.cls} />
                <div className="min-w-0">
                  <p className={`line-clamp-2 text-lg leading-snug ${red ? "font-bold text-alert" : "text-white"}`}>{s.text}</p>
                  <p className="font-mono text-xs text-soft">{clockOf(s.at)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
