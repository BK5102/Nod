// Shared helpers for the backend scripts: .env.local, the CLI admin token, and refusal capture.
import { execSync } from "node:child_process";
import fs from "node:fs";
import { reason } from "@/lib/stdb/node";

export function readEnvLocal(): Map<string, string> {
  const m = new Map<string, string>();
  if (!fs.existsSync(".env.local")) return m;
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.startsWith("#")) m.set(line.slice(0, i), line.slice(i + 1));
  }
  return m;
}

export function writeEnvLocal(updates: Record<string, string>) {
  const m = readEnvLocal();
  for (const [k, v] of Object.entries(updates)) m.set(k, v);
  fs.writeFileSync(".env.local", [...m.entries()].map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
}

/** Values from the process env first, then .env.local. */
export function env(key: string, fallback?: string): string {
  const v = process.env[key] ?? readEnvLocal().get(key) ?? fallback;
  if (v === undefined || v === "") throw new Error(`${key} is not set (in the environment or .env.local)`);
  return v;
}

/** The token of the identity the CLI is logged in as: the one that published the module (the admin). */
export function adminToken(): string {
  const out = execSync("spacetime login show --token", { encoding: "utf8" });
  const m = out.match(/is\s+(\S+)\s*$/m);
  if (!m) throw new Error("Could not read the admin token. Run `spacetime login` first.");
  return m[1]!;
}

/** Runs a reducer call that should be refused. Returns the refusal message, or null if it went through. */
export async function refused(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return reason(e);
  }
}
