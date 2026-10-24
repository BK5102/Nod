import { pingClaude } from "@/lib/claude/client";
import { connection, stdbConfigured } from "@/lib/stdb/server";
import { ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Called on page load: wakes this server instance, opens the agent's database connection, and times Claude. */
export async function GET() {
  const t = Date.now();
  let db = { ok: false, ms: 0, detail: "not configured" };
  if (stdbConfigured()) {
    try {
      await connection("agent");
      db = { ok: true, ms: Date.now() - t, detail: "connected" };
    } catch (e) {
      db = { ok: false, ms: Date.now() - t, detail: (e as Error).message };
    }
  }
  const claude = await pingClaude();
  return ok({ claude, db });
}
