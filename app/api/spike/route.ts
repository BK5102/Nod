import { NextResponse } from "next/server";
import { DbConnection, tables } from "@/src/module_bindings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Spike point (d): a server route connects as the agent identity, calls a reducer, and reads the
 * row back through a subscription. The agent token is server-only.
 */
export async function POST() {
  const host = process.env.SPACETIMEDB_HOST;
  const db = process.env.SPACETIMEDB_DB_NAME;
  const token = process.env.SPACETIMEDB_AGENT_TOKEN;
  if (!host || !db || !token) {
    return NextResponse.json({ ok: false, error: "SPACETIMEDB_HOST, SPACETIMEDB_DB_NAME and SPACETIMEDB_AGENT_TOKEN must be set" }, { status: 500 });
  }
  const text = `from the server route at ${new Date().toISOString()}`;
  try {
    const row = await new Promise<{ id: string; text: string; approved: boolean }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("SpacetimeDB timeout")), 15_000);
      DbConnection.builder()
        .withUri(host)
        .withDatabaseName(db)
        .withToken(token)
        .onConnect((conn) => {
          conn
            .subscriptionBuilder()
            .onApplied(async () => {
              try {
                await conn.reducers.addNote({ text });
                const found = [...conn.db.note.iter()].find((n) => n.text === text);
                clearTimeout(timer);
                conn.disconnect();
                if (!found) reject(new Error("Reducer succeeded but the row was not read back"));
                else resolve({ id: String(found.id), text: found.text, approved: found.approved });
              } catch (e) {
                clearTimeout(timer);
                conn.disconnect();
                reject(e);
              }
            })
            .onError((ctx) => {
              clearTimeout(timer);
              conn.disconnect();
              reject(ctx.event ?? new Error("Subscription error"));
            })
            .subscribe(tables.note);
        })
        .onConnectError((_ctx, err) => {
          clearTimeout(timer);
          reject(err);
        })
        .build();
    });
    return NextResponse.json({ ok: true, row });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
