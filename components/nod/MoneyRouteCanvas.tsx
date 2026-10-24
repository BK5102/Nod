"use client";

import { useEffect, useRef, useState } from "react";
import type { MoneyRoute, RouteRun } from "@/lib/three/route";

/**
 * Hosts the money-route scene. Loaded on demand (three.js stays out of the first paint), plays a run
 * when one arrives, and resets to the empty route otherwise. Without WebGL it renders nothing and the
 * outcome cards below carry the result on their own.
 */
export function MoneyRouteCanvas({ run, onPhase }: { run: RouteRun | null; onPhase?: (p: "idle" | "running" | "done") => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<MoneyRoute | null>(null);
  const [supported, setSupported] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const mod = await import("@/lib/three/route");
      if (disposed || !canvas.current) return;
      if (!mod.webglAvailable()) {
        setSupported(false);
        return;
      }
      if (document.fonts?.ready) await document.fonts.ready;
      if (disposed || !canvas.current) return;
      scene.current = new mod.MoneyRoute(canvas.current);
      setReady(true);
    })();
    return () => {
      disposed = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    s.onPhase = onPhase;
    if (run) s.play(run);
    else s.reset();
  }, [run, ready, onPhase]);

  if (!supported) return null;
  return (
    <figure className="m-0 bg-paper">
      <canvas
        ref={canvas}
        className="block h-[420px] w-full sm:h-[540px]"
        role="img"
        aria-label={
          run
            ? `The same invoice for ${run.vendor} runs down two lanes. The baseline sends it straight to account ending ${run.asksLast4}. Nod runs it through each check and holds it at bank details.`
            : "Two empty lanes: a baseline agent with no checks, and Nod with a gate for each check."
        }
      />
    </figure>
  );
}
