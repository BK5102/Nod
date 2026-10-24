// One-time setup after `pnpm spacetime:publish`. Run as the CLI identity that published the module.
// Creates (or reuses) the agent and operator identities, assigns their seats, writes their tokens to
// .env.local (server-only), and seeds the demo through reset_demo.
//
//   pnpm db:setup                    -> uses SPACETIMEDB_HOST and SPACETIMEDB_DB_NAME from the env or .env.local
import { Identity } from "spacetimedb";
import { connectAs, subscribeAll } from "@/lib/stdb/node";
import { adminToken, env, readEnvLocal, writeEnvLocal } from "./env";

async function main() {
  const host = env("SPACETIMEDB_HOST", "wss://maincloud.spacetimedb.com");
  const db = env("SPACETIMEDB_DB_NAME");
  const local = readEnvLocal();
  const sameDb = local.get("SPACETIMEDB_DB_NAME") === db && local.get("SPACETIMEDB_HOST") === host;

  const admin = await connectAs(host, db, adminToken());
  const agent = await connectAs(host, db, sameDb ? local.get("SPACETIMEDB_AGENT_TOKEN") : undefined);
  const operator = await connectAs(host, db, sameDb ? local.get("SPACETIMEDB_OPERATOR_TOKEN") : undefined);

  await admin.conn.reducers.assignSeat({ who: Identity.fromString(agent.identityHex), actorId: "act_agent" });
  await admin.conn.reducers.assignSeat({ who: Identity.fromString(operator.identityHex), actorId: "act_operator" });
  await operator.conn.reducers.resetDemo({});

  writeEnvLocal({
    SPACETIMEDB_HOST: host,
    SPACETIMEDB_DB_NAME: db,
    NEXT_PUBLIC_SPACETIMEDB_HOST: host,
    NEXT_PUBLIC_SPACETIMEDB_DB_NAME: db,
    SPACETIMEDB_AGENT_TOKEN: agent.token,
    SPACETIMEDB_OPERATOR_TOKEN: operator.token,
  });

  await subscribeAll(operator.conn);
  const trip = operator.conn.db.trip.tripId.find("trip_demo");
  console.log(`Seats assigned. Demo seeded: ${trip ? `${trip.flight}, ${trip.route}, status ${trip.status}` : "trip row not visible yet"}.`);
  console.log("Agent and operator tokens written to .env.local (server-only, never commit).");
  process.exit(0);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
