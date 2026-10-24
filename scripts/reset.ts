// pnpm demo:reset. Resets the demo through the reset_demo reducer as the operator. Never republishes.
import { connectAs } from "@/lib/stdb/node";
import { env } from "./env";

async function main() {
  const { conn } = await connectAs(env("SPACETIMEDB_HOST"), env("SPACETIMEDB_DB_NAME"), env("SPACETIMEDB_OPERATOR_TOKEN"));
  await conn.reducers.resetDemo({});
  console.log("Demo reset: Bayline Air 412 is scheduled again, no offers, no receipts.");
  process.exit(0);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
