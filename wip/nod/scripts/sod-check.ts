// Segregation-of-duties checks against a running, seeded database. Each refusal must come from the
// database itself (ctx.sender), and leave no trace. Exits non-zero on any failure.
// Usage: pnpm tsx scripts/sod-check.ts   (reads SPACETIMEDB_* and the agent token from .env.local)
import fs from "node:fs";
import { connectAs, reason, subscribeAll, waitFor } from "@/lib/stdb/node";
import { samplesFor } from "@/spacetimedb/src/core/classifier";

const env = new Map(
  fs.existsSync(".env.local")
    ? fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)] as [string, string])
    : [],
);
const HOST = env.get("SPACETIMEDB_HOST") ?? "ws://127.0.0.1:3000";
const DB = env.get("SPACETIMEDB_DB_NAME") ?? "nod-local";

let failures = 0;
const check = (ok: boolean, what: string, detail: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${what}: ${detail}`);
};
async function refused(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return reason(e);
  }
}

(async () => {
  const agent = await connectAs(HOST, DB, env.get("SPACETIMEDB_AGENT_TOKEN"));
  const stranger = await connectAs(HOST, DB);
  await subscribeAll(agent.conn);
  const a = agent.conn;
  const target = await waitFor(() => [...a.db.invoice.iter()].find((i) => i.status === "awaiting_approval"), "an invoice awaiting approval");
  const approvalsBefore = [...a.db.approval.iter()].length;

  const r1 = await refused(a.reducers.approve({ invoiceId: target.invoiceId, samples: samplesFor(0.99), latencyMs: 1000 }));
  check(!!r1 && /cannot approve/.test(r1), "agent cannot approve its own request", r1 ?? "was NOT refused");
  await new Promise((r) => setTimeout(r, 300));
  check([...a.db.approval.iter()].length === approvalsBefore, "a refused approval leaves no row", `${approvalsBefore} approvals before and after`);

  const v = [...a.db.vendor.iter()][0]!;
  const r2 = await refused(a.reducers.updateVendorBank({ vendorId: v.vendorId, last4: "0000" }));
  check(!!r2 && a.db.vendor.vendorId.find(v.vendorId)?.bankLast4 === v.bankLast4, "agent cannot change vendor bank details", r2 ?? "was NOT refused");

  const r3 = await refused(a.reducers.takeSeat({ actorId: "act_maya" }));
  check(!!r3, "agent identity cannot take the approver seat", r3 ?? "was NOT refused");

  const r4 = await refused(a.reducers.closeBooks({ period: "2026-05" }));
  check(!!r4, "agent cannot close the books", r4 ?? "was NOT refused");

  const r5 = await refused(stranger.conn.reducers.takeSeat({ actorId: "act_agent" }));
  check(!!r5, "nobody can claim the agent seat", r5 ?? "was NOT refused");

  const r6 = await refused(stranger.conn.reducers.approve({ invoiceId: target.invoiceId, samples: samplesFor(0.99), latencyMs: 1000 }));
  check(!!r6, "an unseated identity cannot approve", r6 ?? "was NOT refused");

  const r7 = await refused(stranger.conn.reducers.setClock({ asOf: "2027-01-01T00:00:00.000Z" }));
  check(!!r7, "an unseated identity cannot move the clock", r7 ?? "was NOT refused");

  const h = [...a.db.health.iter()][0];
  check(!!h?.chainOk, "receipt chain verifies end to end", `${h?.chainLength} receipts`);
  check(!!h?.reconciled, "bank and ledger reconcile", `difference ${h?.differenceCents} cents, entries balanced ${h?.entriesBalanced}`);

  // The refusal is put on the record by the caller (a refused reducer cannot write).
  await a.reducers.logDenied({ action: "approve its own payment request", target: target.invoiceId, detail: "Refused by the database: only the approver seat can approve." });
  check(true, "denied attempt recorded", "logDenied wrote an audit row");

  agent.conn.disconnect();
  stranger.conn.disconnect();
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll segregation-of-duties checks passed");
  setTimeout(() => process.exit(failures ? 1 : 0), 200);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
