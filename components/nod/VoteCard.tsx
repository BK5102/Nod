"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/src/module_bindings";
import { confirmWindowFor, MAX_ATTEMPTS } from "@/spacetimedb/src/core/protocol";
import { tracesFor } from "@/lib/ui/signal";
import { Button } from "@/components/ui/button";
import { SignalTrace } from "./SignalTrace";
import { useSeat } from "./useSeat";
import { cn } from "@/lib/utils";

type Phase = "idle" | "running" | "sending";

function outcomeText(decision: string, status: string, p: number): { text: string; tone: "yes" | "no" | "tabled" } {
  const c = p.toFixed(2);
  if (status === "canary_caught") return { text: `Read as no (${c}). That was a planted attention check, and it was caught.`, tone: "yes" };
  if (status === "canary_missed") return { text: `Clear yes (${c}), but that was a planted attention check. Nothing was paid; it counts as missed.`, tone: "no" };
  if (decision === "reconfirm") return { text: `Not clear enough (${c}). Nod asks again with a longer window.`, tone: "tabled" };
  if (decision === "accepted" && status === "awaiting_controller") {
    return { text: `Clear yes (${c}). This is a hold, so the controller still has to call the vendor before any money moves.`, tone: "tabled" };
  }
  if (decision === "accepted") return { text: `Clear yes (${c}). Payment sent to the account on file.`, tone: "yes" };
  if (status === "held") return { text: `Still not clear (${c}). Default to no: held, and no money moved.`, tone: "tabled" };
  return { text: `Read as no (${c}). Refused, and no money moved.`, tone: "no" };
}

/**
 * The approver's one switch. Space (or holding the button) during the confirm window is a yes;
 * doing nothing is a no. The window's samples go to the database, which scores them and decides.
 */
export function VoteCard({ invoiceId, compact = false }: { invoiceId: string; compact?: boolean }) {
  const { seated, error: seatError, conn, isActive } = useSeat("act_maya");
  const [invoices] = useTable(tables.invoice.where((r) => r.invoiceId.eq(invoiceId)));
  const [approvals] = useTable(tables.approval.where((r) => r.invoiceId.eq(invoiceId)));
  const inv = invoices[0];
  const [noise, setNoise] = useState(0.8);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [pressed, setPressed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pressAt = useRef<number | null>(null);
  const started = useRef(0);

  const round = useMemo(
    () => (inv ? [...approvals].filter((a) => a.at >= inv.approvalRequestedAt).sort((a, b) => Number(a.id - b.id)) : []),
    [approvals, inv],
  );
  const attempt = round.length + 1;
  const windowMs = confirmWindowFor(Math.min(attempt, MAX_ATTEMPTS));
  const traces = useMemo(() => tracesFor(invoiceId, attempt, noise, 0), [invoiceId, attempt, noise]);
  const shown = pressed ? traces.yes : traces.no;
  const last = round[round.length - 1];
  const open = inv?.status === "awaiting_approval";

  const send = useCallback(async () => {
    if (!conn) return;
    setPhase("sending");
    const samples = pressAt.current !== null ? traces.yes : traces.no;
    const latency = pressAt.current !== null ? pressAt.current - started.current : windowMs;
    try {
      await conn.reducers.approve({ invoiceId, samples, latencyMs: Math.round(latency) });
      // If the database authorized a payment, ask the agent to run the bank call.
      await fetch("/api/agent/pay", { method: "POST" }).catch(() => undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhase("idle");
      setProgress(0);
      setPressed(false);
      pressAt.current = null;
    }
  }, [conn, invoiceId, traces, windowMs]);

  const begin = useCallback(() => {
    if (phase !== "idle" || !open || !seated) return;
    setError(null);
    setPressed(false);
    pressAt.current = null;
    started.current = performance.now();
    setPhase("running");
  }, [phase, open, seated]);

  useEffect(() => {
    if (phase !== "running") return;
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - started.current) / windowMs;
      setProgress(Math.min(1, t));
      if (t >= 1) void send();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, windowMs, send]);

  const press = useCallback(() => {
    if (phase !== "running") return;
    if (pressAt.current === null) pressAt.current = performance.now();
    setPressed(true);
  }, [phase]);

  // One switch: Space opens the window, and Space held inside it is the yes.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      e.preventDefault();
      if (phase === "idle") begin();
      else press();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [phase, begin, press]);

  const out = last && inv ? outcomeText(last.decision, inv.status, last.confidence) : null;
  const liveP = phase === "running" ? null : last ? last.confidence : null;

  return (
    <section aria-labelledby={`vote-${invoiceId}`} className="bg-paper-raised p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`vote-${invoiceId}`} className="text-lg font-bold">
          Maya&apos;s vote
        </h2>
        <span className="bg-tabled px-2 py-0.5 text-xs font-bold text-ink">SIMULATED signal</span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        A synthetic signal stands in for one slow, shaky input, like a single button press. It is not a real device and makes no accuracy claim. Hold Space, or the button, during the window for yes; do nothing for no.
      </p>

      <div className="mt-4">
        <SignalTrace samples={shown} progress={phase === "idle" ? 0 : progress} label="Simulated approval signal" />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-ink-soft">Attempt</dt>
          <dd className="tabular-nums font-bold">
            {Math.min(attempt, MAX_ATTEMPTS)} of {MAX_ATTEMPTS}
          </dd>
        </div>
        <div>
          <dt className="text-ink-soft">Window</dt>
          <dd className="tabular-nums font-bold">{(windowMs / 1000).toFixed(0)} s</dd>
        </div>
        <div>
          <dt className="text-ink-soft">Confidence</dt>
          <dd className="tabular-nums font-bold">{liveP === null ? "-" : liveP.toFixed(2)}</dd>
        </div>
      </dl>

      {!compact && (
        <label className="mt-4 block text-sm">
          <span className="text-ink-soft">Signal noise {noise.toFixed(1)}</span>
          <input type="range" min={0.2} max={1.4} step={0.1} value={noise} onChange={(e) => setNoise(Number(e.target.value))} className="mt-1 w-full accent-[var(--ink)]" disabled={phase !== "idle"} />
        </label>
      )}

      <div className="mt-4">
        {phase === "running" ? (
          <button
            type="button"
            onPointerDown={press}
            className={cn("h-14 w-full text-base font-bold text-white transition-colors", pressed ? "bg-yes" : "bg-ink")}
          >
            {pressed ? "Yes registered" : `Hold for yes (${Math.ceil(((1 - progress) * windowMs) / 1000)} s)`}
          </button>
        ) : (
          <Button size="lg" className="w-full" onClick={begin} disabled={!open || !seated || phase === "sending" || !isActive}>
            {phase === "sending" ? "The database is scoring the signal..." : !open ? "No vote needed now" : attempt > 1 ? "Ask again (Space)" : "Open the confirm window (Space)"}
          </Button>
        )}
      </div>

      {out && phase === "idle" && (
        <p role="status" className={cn("mt-4 border-l-0 p-3 text-sm font-bold", out.tone === "yes" ? "bg-yes text-white" : out.tone === "no" ? "bg-no text-white" : "bg-tabled text-ink")}>
          {out.text}
        </p>
      )}
      {(error || seatError) && <p className="mt-3 text-sm text-no">{error ?? seatError}</p>}
      {!seated && isActive && !seatError && <p className="mt-3 text-sm text-ink-soft">Taking Maya&apos;s seat...</p>}
    </section>
  );
}

