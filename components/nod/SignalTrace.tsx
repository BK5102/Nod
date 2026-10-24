"use client";

import { useEffect, useRef } from "react";
import { PROMPT_AT_S, RESPONSE_WINDOW_S, SAMPLE_RATE_HZ } from "@/spacetimedb/src/core/classifier";

/**
 * Draws a SIMULATED single-channel signal. `samples` are the full 3-second window; `progress` (0-1)
 * reveals it left to right as the confirm window runs. The response band is where a yes shows up.
 */
export function SignalTrace({ samples, progress, label }: { samples: number[]; progress: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext("2d");
    if (!g) return;
    g.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--ink").trim() || "#1d2733";
    const rule = css.getPropertyValue("--rule").trim() || "#c9d0d8";
    const band = css.getPropertyValue("--card-tabled").trim() || "#e2a82b";
    g.clearRect(0, 0, w, h);

    const total = 3;
    const x = (s: number) => (s / total) * w;
    g.globalAlpha = 0.16;
    g.fillStyle = band;
    g.fillRect(x(RESPONSE_WINDOW_S[0]), 0, x(RESPONSE_WINDOW_S[1]) - x(RESPONSE_WINDOW_S[0]), h);
    g.globalAlpha = 1;
    g.strokeStyle = rule;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.stroke();
    g.setLineDash([3, 4]);
    g.beginPath();
    g.moveTo(x(PROMPT_AT_S), 0);
    g.lineTo(x(PROMPT_AT_S), h);
    g.stroke();
    g.setLineDash([]);

    const n = Math.max(0, Math.min(samples.length, Math.floor(samples.length * progress)));
    if (n < 2) return;
    const scale = h / 7;
    g.strokeStyle = ink;
    g.lineWidth = 1.75;
    g.lineJoin = "round";
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const px = (i / (samples.length - 1)) * w;
      const py = h / 2 - samples[i]! * scale;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
  }, [samples, progress]);

  return (
    <figure className="m-0">
      <canvas ref={ref} className="block h-28 w-full bg-paper-raised" role="img" aria-label={label} />
      <figcaption className="mt-1 flex justify-between text-xs text-ink-soft">
        <span>Prompt at {PROMPT_AT_S}s</span>
        <span>
          A yes shows up {RESPONSE_WINDOW_S[0]} to {RESPONSE_WINDOW_S[1]}s after the prompt ({SAMPLE_RATE_HZ} samples a second)
        </span>
      </figcaption>
    </figure>
  );
}
