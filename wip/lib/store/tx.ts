import type { AuditEvent, AutonomyState, Receipt, ReceiptBody, SimState } from "@/lib/domain/types";
import { nextReceipt } from "@/lib/receipts/chain";
import { applyMutations, newId, type Mutation, type TableName, type World } from "./world";

/**
 * A unit of work. Every change is applied to the working copy immediately (so later steps see
 * earlier ones) and recorded as a mutation for the store to persist in order.
 */
export class Tx {
  readonly muts: Mutation[] = [];
  constructor(readonly w: World) {}

  private push(m: Mutation) {
    applyMutations(this.w, [m]);
    this.muts.push(m);
  }

  insert<T extends { id: string }>(table: TableName, row: T): T {
    this.push({ op: "insert", table, row });
    return row;
  }

  update(table: TableName, id: string, patch: Record<string, unknown>): void {
    this.push({ op: "update", table, id, patch });
  }

  setAutonomy(row: AutonomyState): void {
    this.push({ op: "set_autonomy", row });
  }

  setSim(row: SimState): void {
    this.push({ op: "set_sim", row });
  }

  audit(e: Omit<AuditEvent, "id" | "at"> & { at?: string }): AuditEvent {
    return this.insert<AuditEvent>("audit_events", { id: newId("aud"), at: e.at ?? this.w.sim_state.as_of, ...e });
  }

  receipt(body: Omit<ReceiptBody, "seq" | "as_of"> & { as_of?: string }): Receipt {
    const prev = this.w.receipts.length ? this.w.receipts[this.w.receipts.length - 1]! : null;
    const r = nextReceipt(prev, { ...body, as_of: body.as_of ?? this.w.sim_state.as_of }, newId("rcpt"));
    return this.insert<Receipt>("receipts", r);
  }
}
