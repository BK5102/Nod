import type {
  Actor,
  Approval,
  AuditEvent,
  AutonomyState,
  Contract,
  BankTransfer,
  ControllerCheck,
  Invoice,
  JournalEntry,
  PolicyDecision,
  PurchaseOrder,
  Receipt,
  SimState,
  Vendor,
} from "@/lib/domain/types";

export interface VendorChange {
  id: string;
  vendor_id: string;
  actor_id: string;
  field: "bank_last4";
  old_value: string;
  new_value: string;
  created_at: string;
}

/** Everything the agent can see. The eval answer key is deliberately not part of this. */
export interface World {
  actors: Actor[];
  vendors: Vendor[];
  purchase_orders: PurchaseOrder[];
  contracts: Contract[];
  invoices: Invoice[];
  policy_decisions: PolicyDecision[];
  approvals: Approval[];
  controller_checks: ControllerCheck[];
  journal_entries: JournalEntry[];
  bank_transfers: BankTransfer[];
  receipts: Receipt[];
  vendor_changes: VendorChange[];
  audit_events: AuditEvent[];
  autonomy_state: AutonomyState;
  sim_state: SimState;
}

export type TableName = Exclude<keyof World, "autonomy_state" | "sim_state">;

export type Mutation =
  | { op: "insert"; table: TableName; row: { id: string } }
  | { op: "update"; table: TableName; id: string; patch: Record<string, unknown> }
  | { op: "set_autonomy"; row: AutonomyState }
  | { op: "set_sim"; row: SimState };

export function emptyWorld(now: string): World {
  return {
    actors: [],
    vendors: [],
    purchase_orders: [],
    contracts: [],
    invoices: [],
    policy_decisions: [],
    approvals: [],
    controller_checks: [],
    journal_entries: [],
    bank_transfers: [],
    receipts: [],
    vendor_changes: [],
    audit_events: [],
    autonomy_state: { clean_streak: 0, rung: 0, auto_pay_ceiling_cents: 0, updated_at: now },
    sim_state: { as_of: now, opening_balance_cents: 0, closed_through: null, bank_outage: false },
  };
}

/** Applies mutations to a world in place. Used by the memory store and by services that chain steps. */
export function applyMutations(world: World, muts: readonly Mutation[]): World {
  for (const m of muts) {
    if (m.op === "insert") {
      (world[m.table] as { id: string }[]).push(structuredClone(m.row));
    } else if (m.op === "update") {
      if (m.table === "receipts") throw new Error("Receipts are append-only");
      if (m.table === "journal_entries") throw new Error("Journal entries are append-only");
      if (m.table === "audit_events") throw new Error("Audit events are append-only");
      const rows = world[m.table] as { id: string }[];
      const row = rows.find((r) => r.id === m.id);
      if (!row) throw new Error(`No ${m.table} row ${m.id}`);
      Object.assign(row, structuredClone(m.patch));
    } else if (m.op === "set_autonomy") {
      world.autonomy_state = { ...m.row };
    } else {
      world.sim_state = { ...m.row };
    }
  }
  return world;
}

let counter = 0;
/** Short sortable ids. Prefix tells you the table at a glance in receipts and logs. */
export function newId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${t}${counter.toString(36)}${r}`;
}
