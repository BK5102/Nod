// Seeds Eastbay Community Pantry and replays six months of history through the real reducers.
// Every row in the database, every receipt and every ledger line is produced by the same code paths
// a live invoice takes: submit_invoice, escalate_invoice, approve, controller_decision, settle_payment.
//
// Usage (defaults to the local server):
//   pnpm seed                                  -> ws://127.0.0.1:3000, database nod-local
//   SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com SPACETIMEDB_DB_NAME=<name> pnpm seed
// Needs the CLI to be logged in as the identity that published the module (the admin).
import { execSync } from "node:child_process";
import fs from "node:fs";
import { MockBank } from "@/lib/bank/mock";
import { heuristicCheck } from "@/lib/claude/check";
import { ACTORS, COMPANY, CONTRACTS, PURCHASE_ORDERS, VENDORS } from "@/lib/seed/company";
import { answerKey, INVOICE_SPECS, materialize, PERIOD_CLOSES, type InvoiceSpec } from "@/lib/seed/scenario";
import { checkInputFor } from "@/lib/stdb/map";
import { connectAs, reason, subscribeAll, waitFor, type Conn } from "@/lib/stdb/node";
import { samplesFor } from "@/spacetimedb/src/core/classifier";
import { Identity } from "spacetimedb";

const HOST = process.env.SPACETIMEDB_HOST ?? "ws://127.0.0.1:3000";
const DB = process.env.SPACETIMEDB_DB_NAME ?? "nod-local";
const UNTIL = process.env.SEED_UNTIL ?? COMPANY.demo_as_of;

function adminToken(): string {
  const exe = process.platform === "win32" ? `"${process.env.LOCALAPPDATA}\\SpacetimeDB\\spacetime.exe"` : "spacetime";
  const out = execSync(`${exe} login show --token`, { encoding: "utf8" });
  const m = out.match(/is\s+(\S+)\s*$/m);
  if (!m) throw new Error("Could not read the admin token. Run `spacetime login` first.");
  return m[1]!;
}

function readEnvLocal(): Map<string, string> {
  const m = new Map<string, string>();
  if (!fs.existsSync(".env.local")) return m;
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) m.set(line.slice(0, i), line.slice(i + 1));
  }
  return m;
}

function writeEnvLocal(updates: Record<string, string>) {
  const m = readEnvLocal();
  for (const [k, v] of Object.entries(updates)) m.set(k, v);
  fs.writeFileSync(".env.local", [...m.entries()].map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
}

type Event =
  | { at: string; kind: "invoice"; spec: InvoiceSpec }
  | { at: string; kind: "approve"; spec: InvoiceSpec; attempt: number }
  | { at: string; kind: "controller"; spec: InvoiceSpec }
  | { at: string; kind: "close"; period: string }
  | { at: string; kind: "tick" };

const iso = (date: string, hour: number) => `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`;
const plusDays = (date: string, n: number) => {
  const t = new Date(`${date}T12:00:00.000Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

function timeline(until: string): Event[] {
  const ev: Event[] = [];
  for (const s of INVOICE_SPECS) {
    ev.push({ at: iso(s.date, s.hour ?? 9), kind: "invoice", spec: s });
    if (s.approver) {
      s.approver.confidences.forEach((_, i) =>
        ev.push({ at: iso(plusDays(s.date, s.approver!.after_days), 14 + i), kind: "approve", spec: s, attempt: i }),
      );
      if (s.controller) ev.push({ at: iso(plusDays(s.date, s.approver.after_days + s.controller.after_days), 11), kind: "controller", spec: s });
    }
  }
  for (const c of PERIOD_CLOSES) ev.push({ at: iso(c.date, 17), kind: "close", period: c.period });
  for (let d = "2026-01-02"; iso(d, 8) <= until; d = plusDays(d, 1)) ev.push({ at: iso(d, 8), kind: "tick" });
  return ev.filter((e) => e.at <= until).sort((a, b) => a.at.localeCompare(b.at));
}

async function main() {
  const t0 = Date.now();
  console.log(`Seeding ${DB} on ${HOST} through ${UNTIL}`);
  const env = readEnvLocal();
  const sameDb = env.get("SPACETIMEDB_DB_NAME") === DB && env.get("SPACETIMEDB_HOST") === HOST;

  const admin = await connectAs(HOST, DB, adminToken());
  const agent = await connectAs(HOST, DB, sameDb ? env.get("SPACETIMEDB_AGENT_TOKEN") : undefined);
  const operator = await connectAs(HOST, DB, sameDb ? env.get("SPACETIMEDB_OPERATOR_TOKEN") : undefined);
  const [maya, rosa, luis] = await Promise.all([connectAs(HOST, DB), connectAs(HOST, DB), connectAs(HOST, DB)]);

  const company = {
    as_of: COMPANY.history_start,
    opening_balance_cents: COMPANY.opening_balance_cents,
    actors: ACTORS,
    vendors: VENDORS,
    contracts: CONTRACTS,
    purchase_orders: PURCHASE_ORDERS,
  };
  await admin.conn.reducers.seedCompany({ json: JSON.stringify(company) });
  await admin.conn.reducers.setAnswerKey({ json: JSON.stringify(answerKey()) });
  await admin.conn.reducers.assignSeat({ who: Identity.fromString(agent.identityHex), actorId: "act_agent" });
  await admin.conn.reducers.assignSeat({ who: Identity.fromString(operator.identityHex), actorId: "act_operator" });
  await maya.conn.reducers.takeSeat({ actorId: "act_maya" });
  await rosa.conn.reducers.takeSeat({ actorId: "act_rosa" });
  await luis.conn.reducers.takeSeat({ actorId: "act_luis" });
  const approvers: Record<string, Conn> = { act_maya: maya.conn, act_rosa: rosa.conn };

  const a = agent.conn;
  await subscribeAll(a);
  const bank = new MockBank(() => a.db.simClock.id.find(1)?.bankOutage ?? false);
  let current = a.db.simClock.id.find(1)?.asOf ?? COMPANY.history_start;
  let calls = 0;
  const problems: string[] = [];

  const advance = async (at: string) => {
    if (at <= current) return;
    await admin.conn.reducers.setClock({ asOf: at });
    calls++;
    current = at;
  };

  const runPayQueue = async () => {
    for (const p of [...a.db.payQueue.iter()]) {
      const r = await bank.pay({ idempotency_key: p.idempotencyKey, amount_cents: p.amountCents, to: { name: p.vendorName, last4: p.toLast4 }, memo: p.invoiceId });
      if (r.ok) await a.reducers.settlePayment({ invoiceId: p.invoiceId, externalId: r.external_id, adapter: r.adapter });
      else await a.reducers.paymentFailed({ invoiceId: p.invoiceId, adapter: r.adapter, error: r.error });
      calls++;
    }
  };

  for (const e of timeline(UNTIL)) {
    await advance(e.at);
    try {
      if (e.kind === "invoice") {
        const s = e.spec;
        const { extracted, raw_text } = materialize(s);
        const args = {
          invoiceId: s.id,
          extractedJson: JSON.stringify(extracted),
          rawText: raw_text,
          sourceFormat: s.format,
          filePath: s.format === "pdf" || s.format === "image" ? `/invoices/${s.id}.${s.format === "pdf" ? "pdf" : "png"}` : "",
          extractionMethod: "seed",
          handoffJson: s.handoff ? JSON.stringify({ from: s.handoff.from, note: s.handoff.note, missing: s.handoff.missing }) : "",
        };
        if (s.is_canary) await operator.conn.reducers.injectCanary(args);
        else await a.reducers.submitInvoice(args);
        const input = await waitFor(() => checkInputFor(a, s.id), `decision for ${s.id}`);
        await a.reducers.escalateInvoice({ invoiceId: s.id, claudeJson: JSON.stringify(heuristicCheck(input)) });
        calls += 2;
        await runPayQueue();
      } else if (e.kind === "approve") {
        const inv = a.db.invoice.invoiceId.find(e.spec.id);
        if (!inv || inv.status !== "awaiting_approval") continue;
        const script = e.spec.approver!;
        const who = script.actor_id ?? inv.assignedApprover ?? "act_maya";
        await approvers[who]!.reducers.approve({
          invoiceId: inv.invoiceId,
          samples: samplesFor(script.confidences[e.attempt]!),
          latencyMs: script.latency_ms ?? 4000,
        });
        calls++;
        await runPayQueue();
      } else if (e.kind === "controller") {
        const inv = a.db.invoice.invoiceId.find(e.spec.id);
        if (!inv || inv.status !== "awaiting_controller") continue;
        await luis.conn.reducers.controllerDecision({ invoiceId: inv.invoiceId, outcome: e.spec.controller!.outcome, note: e.spec.controller!.note });
        calls++;
        await runPayQueue();
      } else if (e.kind === "close") {
        await luis.conn.reducers.closeBooks({ period: e.period });
        calls++;
      }
    } catch (err) {
      problems.push(`${e.at} ${e.kind} ${"spec" in e ? e.spec.id : ""}: ${reason(err)}`);
    }
  }
  await advance(UNTIL);

  writeEnvLocal({
    SPACETIMEDB_HOST: HOST,
    SPACETIMEDB_DB_NAME: DB,
    NEXT_PUBLIC_SPACETIMEDB_HOST: HOST,
    NEXT_PUBLIC_SPACETIMEDB_DB_NAME: DB,
    SPACETIMEDB_AGENT_TOKEN: agent.token,
    SPACETIMEDB_OPERATOR_TOKEN: operator.token,
  });

  await new Promise((r) => setTimeout(r, 500));
  const counts = new Map<string, number>();
  for (const i of a.db.invoice.iter()) counts.set(i.status, (counts.get(i.status) ?? 0) + 1);
  const h = [...a.db.health.iter()][0];
  const auto = a.db.autonomyState.id.find(1);
  const can = a.db.canaryStats.id.find(1);
  console.log(`\n${calls} reducer calls in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("Invoices by status:", Object.fromEntries([...counts.entries()].sort()));
  console.log(`Receipts: ${[...a.db.receipt.iter()].length}, chain ok: ${h?.chainOk}, reconciled: ${h?.reconciled} (ledger ${h?.ledgerCashCents}, bank ${h?.bankCashCents})`);
  console.log(`Autonomy: rung ${auto?.rung}, ceiling ${auto?.ceilingCents}, streak ${auto?.cleanStreak}. Canaries: ${can?.caught} caught, ${can?.missed} missed of ${can?.presented}`);
  if (problems.length) {
    console.log(`\n${problems.length} event(s) were refused:`);
    for (const p of problems) console.log(`  ${p}`);
  }
  for (const c of [admin, agent, operator, maya, rosa, luis]) c.conn.disconnect();
  setTimeout(() => process.exit(problems.length ? 1 : 0), 300);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
