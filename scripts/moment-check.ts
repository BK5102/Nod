// Plays the demo's moment against the database exactly as the vote card would, then reports.
// A noisy yes (noise 0.8) on the changed-bank-details invoice must be asked again, then held.
import { connectAs, subscribeAll, waitFor } from "@/lib/stdb/node";
import { tracesFor } from "@/lib/ui/signal";

const HOST = process.env.SPACETIMEDB_HOST ?? "ws://127.0.0.1:3000";
const DB = process.env.SPACETIMEDB_DB_NAME ?? "nod-local";
const ID = "inv_moment";
(async () => {
  const maya = await connectAs(HOST, DB);
  await maya.conn.reducers.takeSeat({ actorId: "act_maya" });
  await subscribeAll(maya.conn);
  const c = maya.conn;
  for (const attempt of [1, 2]) {
    await c.reducers.approve({ invoiceId: ID, samples: tracesFor(ID, attempt, 0.8, 0).yes, latencyMs: 1500 });
    const row = await waitFor(() => [...c.db.approval.iter()].filter((a) => a.invoiceId === ID).length >= attempt && [...c.db.approval.iter()].filter((a) => a.invoiceId === ID).sort((a, b) => Number(a.id - b.id))[attempt - 1], "approval row");
    console.log(`attempt ${attempt}: ${row.decision} at ${row.confidence.toFixed(3)}, window ${row.windowMs} ms`);
  }
  const inv = c.db.invoice.invoiceId.find(ID)!;
  const r = [...c.db.receipt.iter()].filter((x) => x.invoiceId === ID).pop();
  console.log(`invoice is ${inv.status}; receipt #${r?.seq} ${r?.decision}: ${r?.note}`);
  const ok = inv.status === "held" && r?.decision === "held";
  console.log(ok ? "MOMENT OK" : "MOMENT FAILED");
  c.disconnect();
  setTimeout(() => process.exit(ok ? 0 : 1), 200);
})();
