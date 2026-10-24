// Phase S0 spike, points (a) to (c), run against a SpacetimeDB server from Node.
// Point (d) is the Next.js route at app/api/spike/route.ts.
// Usage: SPACETIMEDB_HOST=ws://127.0.0.1:3000 SPACETIMEDB_DB_NAME=nod-spike pnpm tsx scripts/spike.ts
import { DbConnection, tables } from "../src/module_bindings";

const HOST = process.env.SPACETIMEDB_HOST ?? "ws://127.0.0.1:3000";
const DB = process.env.SPACETIMEDB_DB_NAME ?? "nod-spike";

type Conn = DbConnection;

function connect(label: string, token?: string): Promise<Conn> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: connect timeout`)), 15_000);
    DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DB)
      .withToken(token)
      .onConnect((conn) => {
        clearTimeout(timer);
        resolve(conn);
      })
      .onConnectError((_ctx, err) => {
        clearTimeout(timer);
        reject(err);
      })
      .build();
  });
}

function subscribe(conn: Conn): Promise<void> {
  return new Promise((resolve, reject) => {
    conn
      .subscriptionBuilder()
      .onApplied(() => resolve())
      .onError((ctx) => reject(ctx.event ?? new Error("subscription error")))
      .subscribe(tables.note);
  });
}

const results: { point: string; pass: boolean; detail: string }[] = [];
const record = (point: string, pass: boolean, detail: string) => {
  results.push({ point, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${point}: ${detail}`);
};

async function expectReject(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as Error).message ?? String(e);
  }
}

async function main() {
  const [agent, approver, watcher] = await Promise.all([
    connect("agent", process.env.SPACETIMEDB_AGENT_TOKEN),
    connect("approver", process.env.SPACETIMEDB_APPROVER_TOKEN),
    connect("watcher"),
  ]);
  await agent.reducers.claimRole({ role: "agent" }).catch(() => undefined);
  await approver.reducers.claimRole({ role: "approver" }).catch(() => undefined);
  await subscribe(watcher);
  await subscribe(agent);

  // (a) A reducer writes a row and a subscriber sees it live, pushed by the server.
  const text = `spike ${Date.now()}`;
  const seen = new Promise<bigint>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("no live insert within 10s")), 10_000);
    watcher.db.note.onInsert((_ctx, row) => {
      if (row.text === text) {
        clearTimeout(t);
        resolve(row.id);
      }
    });
  });
  await agent.reducers.addNote({ text });
  const id = await seen.catch((e: Error) => {
    record("(a) live subscription", false, e.message);
    return null;
  });
  if (id !== null) record("(a) live subscription", true, `watcher received note ${id} pushed from the server`);

  // (b) The agent identity is refused by approve_note; the approver identity succeeds.
  if (id !== null) {
    const refused = await expectReject(agent.reducers.approveNote({ id }));
    record("(b) role check by ctx.sender", refused !== null, refused ? `agent refused: ${refused}` : "agent was NOT refused");
    const ok = await expectReject(approver.reducers.approveNote({ id }));
    record("(b) approver allowed", ok === null, ok ?? "approver approved the note");
  }

  // (c) A reducer that writes then throws leaves no trace.
  const before = [...watcher.db.note.iter()].length;
  const boomText = `boom ${Date.now()}`;
  const err = await expectReject(agent.reducers.boom({ text: boomText }));
  await new Promise((r) => setTimeout(r, 750));
  const after = [...watcher.db.note.iter()];
  const leaked = after.some((n) => n.text === boomText);
  record("(c) atomic revert", err !== null && !leaked && after.length === before, `threw "${err}", rows before ${before}, after ${after.length}`);

  for (const c of [agent, approver, watcher]) c.disconnect();
  const failed = results.filter((r) => !r.pass);
  console.log(failed.length ? `\n${failed.length} spike point(s) failed` : "\nAll spike points (a)-(c) passed");
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("Spike crashed:", e);
  process.exit(1);
});
