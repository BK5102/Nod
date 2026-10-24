// Creates the server's own SpacetimeDB identity, claims the "agent" role for it, and writes its
// token to .env.local (gitignored) as SPACETIMEDB_AGENT_TOKEN. Run once per database.
// Usage: SPACETIMEDB_HOST=... SPACETIMEDB_DB_NAME=... pnpm tsx scripts/agent-token.ts
import fs from "node:fs";
import { DbConnection } from "../src/module_bindings";

const HOST = process.env.SPACETIMEDB_HOST ?? "ws://127.0.0.1:3000";
const DB = process.env.SPACETIMEDB_DB_NAME ?? "nod-spike";

DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB)
  .onConnect(async (conn, identity, token) => {
    try {
      await conn.reducers.claimRole({ role: "agent" });
      const file = ".env.local";
      const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/) : [];
      const set = (k: string, v: string) => {
        const i = lines.findIndex((l) => l.startsWith(`${k}=`));
        if (i >= 0) lines[i] = `${k}=${v}`;
        else lines.push(`${k}=${v}`);
      };
      set("SPACETIMEDB_HOST", HOST);
      set("SPACETIMEDB_DB_NAME", DB);
      set("SPACETIMEDB_AGENT_TOKEN", token);
      fs.writeFileSync(file, lines.filter((l, i, a) => l !== "" || i < a.length - 1).join("\n") + "\n");
      console.log(`Agent identity ${identity.toHexString().slice(0, 12)}... holds the agent role. Token written to .env.local.`);
    } catch (e) {
      console.error("Could not claim the agent role:", (e as Error).message);
      process.exitCode = 1;
    } finally {
      conn.disconnect();
      setTimeout(() => process.exit(), 200);
    }
  })
  .onConnectError((_ctx, err) => {
    console.error("Connect failed:", err);
    process.exit(1);
  })
  .build();
