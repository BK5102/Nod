import "server-only";
import { connectAs, subscribeAll, type Conn } from "./node";

/**
 * Server-side SpacetimeDB connections, cached per server instance. The agent and operator tokens
 * are server-only env vars; the browser never sees them.
 */
type Role = "agent" | "operator";
const cache = new Map<Role, Promise<Conn>>();

function tokenFor(role: Role): string | undefined {
  return role === "agent" ? process.env.SPACETIMEDB_AGENT_TOKEN : process.env.SPACETIMEDB_OPERATOR_TOKEN;
}

export function stdbConfigured(): boolean {
  return !!(process.env.SPACETIMEDB_HOST && process.env.SPACETIMEDB_DB_NAME && process.env.SPACETIMEDB_AGENT_TOKEN);
}

export async function connection(role: Role): Promise<Conn> {
  const existing = cache.get(role);
  if (existing) {
    const c = await existing.catch(() => null);
    if (c && c.isActive) return c;
    cache.delete(role);
  }
  const host = process.env.SPACETIMEDB_HOST;
  const db = process.env.SPACETIMEDB_DB_NAME;
  const token = tokenFor(role);
  if (!host || !db || !token) throw new Error(`SpacetimeDB is not configured for the ${role} (set SPACETIMEDB_HOST, SPACETIMEDB_DB_NAME and the ${role} token)`);
  const p = (async () => {
    const { conn } = await connectAs(host, db, token);
    await subscribeAll(conn);
    return conn;
  })();
  cache.set(role, p);
  return p;
}
