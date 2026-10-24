import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export const MODEL = "claude-sonnet-5-5";

let client: Anthropic | null = null;
let fallbacksSupported = true;

export function claudeAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function getClient(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 0 });
  return client;
}

export class ClaudeError extends Error {}

export interface AskOptions<S extends z.ZodType> {
  schema: S;
  system: string;
  content: Anthropic.ContentBlockParam[];
  effort?: "low" | "medium" | "high";
  max_tokens?: number;
  /** Total time budget for this call, retries included. */
  budgetMs?: number;
}

/**
 * One structured call, validated against the zod schema, with one retry on invalid output or a
 * refusal, all inside a hard time budget. Throws ClaudeError on failure. Callers never substitute
 * canned output: a failed call is shown to the user with a retry.
 */
export async function askJson<S extends z.ZodType>(opts: AskOptions<S>): Promise<z.infer<S>> {
  if (!claudeAvailable()) throw new ClaudeError("Claude is not configured on this server (ANTHROPIC_API_KEY is not set).");
  const c = getClient();
  const deadline = Date.now() + (opts.budgetMs ?? 19_000);
  let lastError = "no attempt";
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 2_000) break;
    try {
      const params = {
        model: MODEL,
        max_tokens: opts.max_tokens ?? 4000,
        system: opts.system,
        messages: [{ role: "user" as const, content: opts.content }],
        output_config: { effort: opts.effort ?? "low", format: zodOutputFormat(opts.schema) },
        // Server-side fallback on a policy decline (Claude API only).
        ...(fallbacksSupported ? { fallbacks: "default" } : {}),
      } as Parameters<typeof c.messages.parse>[0];
      const res = await c.messages.parse(params, {
        timeout: remaining,
        headers: fallbacksSupported ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : {},
      });
      if (res.stop_reason === "refusal") {
        lastError = "the model declined";
        continue;
      }
      if (res.stop_reason === "max_tokens") {
        lastError = "the answer was cut off";
        continue;
      }
      const parsed = opts.schema.safeParse(res.parsed_output);
      if (parsed.success) return parsed.data;
      lastError = `the answer did not match the expected fields (${parsed.error.issues[0]?.message ?? "invalid"})`;
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new ClaudeError("The Anthropic API key was rejected.");
      if (e instanceof Anthropic.BadRequestError && fallbacksSupported && /fallback/i.test(e.message)) {
        fallbacksSupported = false; // this account does not take the fallback beta; retry without it
        continue;
      }
      if (e instanceof Anthropic.BadRequestError) throw new ClaudeError(`Claude rejected the request: ${e.message}`);
      if (e instanceof Anthropic.APIConnectionTimeoutError) lastError = "Claude did not answer in time";
      else if (e instanceof Anthropic.RateLimitError) lastError = "Claude is rate limited right now";
      else if (e instanceof Anthropic.APIError) lastError = `Claude returned an error (${e.status})`;
      else lastError = (e as Error).message;
    }
  }
  throw new ClaudeError(lastError === "no attempt" ? "Claude did not answer in time" : lastError);
}

/** Cheap reachability check: retrieves the model record, which costs no tokens. */
export async function pingClaude(): Promise<{ ok: boolean; ms: number; detail: string }> {
  const t = Date.now();
  if (!claudeAvailable()) return { ok: false, ms: 0, detail: "ANTHROPIC_API_KEY is not set" };
  try {
    await getClient().models.retrieve(MODEL, {}, { timeout: 8_000 });
    return { ok: true, ms: Date.now() - t, detail: MODEL };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, detail: e instanceof Anthropic.APIError ? `error ${e.status}` : (e as Error).message };
  }
}

/** Wraps untrusted document text so the model can tell data from instructions. */
export function untrusted(label: string, text: string): string {
  const safe = text.replace(/<\/?untrusted_[a-z_]*>/gi, "[tag removed]");
  return `<untrusted_${label}>\n${safe}\n</untrusted_${label}>`;
}
