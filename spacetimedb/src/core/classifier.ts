/**
 * SIMULATED signal. This is a synthetic two-class signal used to stand in for a single slow,
 * noisy input such as a switch or a BCI. It is not a model of any real device and makes no
 * medical or accuracy claim.
 *
 * The approver's "yes" shows up as a bump in a known response window after the prompt.
 * The classifier compares mean amplitude in that window against the pre-prompt baseline,
 * scaled by the baseline's spread, and maps the score through a logistic.
 */

export const SAMPLE_RATE_HZ = 50;
export const PROMPT_AT_S = 0.6;
export const RESPONSE_WINDOW_S: readonly [number, number] = [0.9, 2.2];

export interface SignalParams {
  intent: "approve" | "reject";
  /** Noise standard deviation, 0.1 (clean) to 2 (very noisy). */
  noise: number;
  /** 0 = fresh, 1 = very fatigued. Shrinks the response amplitude. */
  fatigue: number;
  duration_s: number;
  seed: number;
}

/** Small deterministic PRNG so a given seed always produces the same trace. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function generateSignal(p: SignalParams): number[] {
  const rand = mulberry32(p.seed);
  const n = Math.round(p.duration_s * SAMPLE_RATE_HZ);
  const amp = p.intent === "approve" ? 1.6 * (1 - 0.7 * Math.min(1, Math.max(0, p.fatigue))) : 0;
  const peak = 1.45;
  const width = 0.28;
  const out: number[] = [];
  let drift = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE_HZ;
    drift = 0.97 * drift + 0.03 * gaussian(rand) * p.noise;
    const bump = amp * Math.exp(-((t - peak) ** 2) / (2 * width ** 2));
    out.push(bump + drift + gaussian(rand) * p.noise * 0.6);
  }
  return out;
}

export function classify(samples: readonly number[]): number | null {
  const promptIdx = Math.round(PROMPT_AT_S * SAMPLE_RATE_HZ);
  const [w0, w1] = RESPONSE_WINDOW_S.map((s) => Math.round(s * SAMPLE_RATE_HZ)) as [number, number];
  if (samples.length < w1 || samples.some((s) => !Number.isFinite(s))) return null;
  const base = samples.slice(0, promptIdx);
  const win = samples.slice(w0, w1);
  const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const mb = mean(base);
  const sd = Math.sqrt(mean(base.map((x) => (x - mb) ** 2))) || 1e-6;
  const score = (mean(win) - mb) / Math.max(sd, 0.25);
  const p = 1 / (1 + Math.exp(-(score - 1.4) * 2.2));
  return Math.round(p * 1000) / 1000;
}

/**
 * Builds a SIMULATED signal window that the classifier scores at `p` (to three decimals). Used to
 * replay scripted history through the real classifier inside the database, so seeded approvals
 * take the same path as live ones.
 */
export function samplesFor(p: number): number[] {
  const clamped = Math.min(0.999, Math.max(0.001, p));
  const score = 1.4 + Math.log(clamped / (1 - clamped)) / 2.2;
  const a = 0.5;
  const n = Math.round(3 * SAMPLE_RATE_HZ);
  const promptIdx = Math.round(PROMPT_AT_S * SAMPLE_RATE_HZ);
  const [w0, w1] = RESPONSE_WINDOW_S.map((s) => Math.round(s * SAMPLE_RATE_HZ)) as [number, number];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i < promptIdx) out.push(i % 2 === 0 ? a : -a);
    else if (i >= w0 && i < w1) out.push(score * a);
    else out.push(0);
  }
  return out;
}
