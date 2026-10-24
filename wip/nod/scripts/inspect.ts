// Prints where every planted error and the live queue ended up. Dev aid.
import { connectAs, subscribeAll } from "@/lib/stdb/node";
import { INVOICE_SPECS } from "@/lib/seed/scenario";

const HOST = process.env.SPACETIMEDB_HOST ?? "ws://127.0.0.1:3000";
const DB = process.env.SPACETIMEDB_DB_NAME ?? "nod-local";
(async () => {
  const { conn } = await connectAs(HOST, DB);
  await subscribeAll(conn);
  for (const s of INVOICE_SPECS) {
    const inv = conn.db.invoice.invoiceId.find(s.id);
    const d = conn.db.policyDecision.invoiceId.find(s.id);
    const interesting = s.answer.expected_action === "stop" || inv?.status === "awaiting_approval" || inv?.status === "held";
    if (!interesting) continue;
    const fired = d ? (JSON.parse(d.rulesJson) as { id: string; fired: boolean }[]).filter((r) => r.fired).map((r) => r.id).join(",") : "-";
    const flags = d?.claudeJson ? (JSON.parse(d.claudeJson) as { flags: { code: string }[] }).flags.map((f) => f.code).join(",") : "";
    console.log(`${s.id.padEnd(22)} ${s.answer.error_type.padEnd(24)} ${String(inv?.status).padEnd(18)} ${d?.ruleTier}->${d?.finalTier}  rules[${fired}] review[${flags}]`);
  }
  conn.disconnect();
  setTimeout(() => process.exit(0), 200);
})();
