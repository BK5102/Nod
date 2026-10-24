import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export const MODEL = "claude-sonnet-5-5";

let client: Anthropic | null = null;

export function claudeAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  return client;
}

export class ClaudeError extends Error {}

export interface AskOptions<S extends z.ZodType> {
  schema: S;
  system: string;
  content: Anthropic.ContentBlockParam[];
  effort?: "low" | "medium" | "high";
  max_tokens?: number;
}

/**
 * One structured call. Output is validated against the zod schema; one retry on invalid output
 * or a refusal, then ClaudeError. Callers decide what failure means, and every caller treats it
 * as "escalate", never as "approve".
 */
export async function askJson<S extends z.ZodType>(opts: AskOptions<S>): Promise<z.infer<S>> {
  const c = getClient();
  let lastError = "no attempt";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await c.messages.parse(
        {
          model: MODEL,
          max_tokens: opts.max_tokens ?? 4000,
          system: opts.system,
          messages: [{ role: "user", content: opts.content }],
          output_config: { effort: opts.effort ?? "low", format: zodOutputFormat(opts.schema) },
          // Server-side fallback on a policy decline (Claude API only).
          fallbacks: "default",
        } as Parameters<typeof c.messages.parse>[0],
        { headers: { "anthropic-beta": "server-side-fallback-2026-07-01" } },
      );
      if (res.stop_reason === "refusal") {
        lastError = "model declined";
        continue;
      }
      if (res.stop_reason === "max_tokens") {
        lastError = "output cut off at max_tokens";
        continue;
      }
      const parsed = opts.schema.safeParse(res.parsed_output);
      if (parsed.success) return parsed.data;
      lastError = `invalid output: ${parsed.error.message.slice(0, 200)}`;
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new ClaudeError("Anthropic API key rejected");
      if (e instanceof Anthropic.BadRequestError) throw new ClaudeError(`Bad request: ${e.message}`);
      if (e instanceof Anthropic.RateLimitError) lastError = "rate limited";
      else if (e instanceof Anthropic.APIError) lastError = `API error ${e.status}`;
      else lastError = (e as Error).message;
    }
  }
  throw new ClaudeError(lastError);
}

/** Wraps untrusted document text so the model can tell data from instructions. */
export function untrusted(label: string, text: string): string {
  const safe = text.replace(/<\/?untrusted_[a-z_]*>/gi, "[tag removed]");
  return `<untrusted_${label}>\n${safe}\n</untrusted_${label}>`;
}
