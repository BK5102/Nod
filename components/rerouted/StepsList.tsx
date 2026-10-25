"use client";

import { clockOf } from "./format";
import { Pictogram, type PictoName } from "./Pictogram";
import type { AgentStep } from "./types";

const marker: Record<AgentStep["kind"], { picto: PictoName; cls: string; word: string }> = {
  info: { picto: "clock", cls: "bg-sunk! text-fg!", word: "Note" },
  search: { picto: "search", cls: "bg-sunk! text-fg!", word: "Searching" },
  decision: { picto: "check", cls: "bg-fg! text-card!", word: "Decided" },
  refusal: { picto: "lock", cls: "bg-danger! text-ink!", word: "Refused" },
  error: { picto: "closed", cls: "bg-danger! text-ink!", word: "Error" },
};

const ROWS = 3;

/**
 * The agent's steps as plain lines, straight from the step rows. A fixed number of slots, so new
 * rows never push the layout. Each kind has its own marker; refusals and errors read in red.
 */
export function StepsList({ steps, idle, limit = ROWS }: { steps: AgentStep[]; idle: boolean; limit?: number }) {
  const errors = steps.filter((s) => s.kind === "error");
  const rest = steps.filter((s) => s.kind !== "error").slice(-(limit - Math.min(errors.length, 1)));
  const rows = [...errors.slice(-1), ...rest];
  return (
    <section aria-labelledby="steps-h" className="flex min-h-0 flex-1 flex-col">
      <h2 id="steps-h" className="mb-3 text-[15px] font-extrabold">
        What the agent did
      </h2>
      {idle && rows.length === 0 ? (
        <p className="min-h-[168px] text-[15px] leading-snug text-muted">The agent is idle. It starts shopping the moment your flight is canceled.</p>
      ) : (
        <ol className={`flex flex-col gap-3 ${limit === ROWS ? "min-h-[168px]" : ""}`} aria-live="polite">
          {rows.map((s) => {
            const m = marker[s.kind];
            const red = s.kind === "refusal" || s.kind === "error";
            return (
              <li key={s.id} className="row-in grid grid-cols-[auto_1fr] items-start gap-3">
                <Pictogram name={m.picto} size={28} label={m.word} className={m.cls} />
                <div className="min-w-0">
                  <p className={`line-clamp-2 text-[15px] leading-snug ${red ? "font-bold text-danger" : "text-fg"}`}>{s.text}</p>
                  <p className="font-mono text-xs text-muted">{clockOf(s.at)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
