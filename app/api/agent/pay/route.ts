import { runPayQueue } from "@/lib/agent/run";
import { connection } from "@/lib/stdb/server";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Executes whatever the database has authorized. Called after an approval or a controller confirm. */
export async function POST() {
  try {
    const agent = await connection("agent");
    return ok(await runPayQueue(agent));
  } catch (e) {
    return fail(e);
  }
}
