import { DbConnection, tables } from "@/src/module_bindings";

export type Conn = DbConnection;

export interface Connected {
  conn: Conn;
  identityHex: string;
  token: string;
}

/** Opens a connection, optionally as a known identity (token), and resolves once connected. */
export function connectAs(host: string, db: string, token?: string, timeoutMs = 20_000): Promise<Connected> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("SpacetimeDB connection timed out")), timeoutMs);
    DbConnection.builder()
      .withUri(host)
      .withDatabaseName(db)
      .withToken(token)
      .onConnect((conn, identity, tok) => {
        clearTimeout(timer);
        resolve({ conn, identityHex: identity.toHexString(), token: tok });
      })
      .onConnectError((_ctx, err) => {
        clearTimeout(timer);
        reject(err);
      })
      .build();
  });
}

/** Every public table and view the server needs to reason about the books. */
export const ALL_TABLES = [
  tables.actor,
  tables.seat,
  tables.vendor,
  tables.vendorChange,
  tables.contract,
  tables.purchaseOrder,
  tables.invoice,
  tables.canaryStats,
  tables.policyDecision,
  tables.approval,
  tables.controllerCheck,
  tables.receipt,
  tables.autonomyState,
  tables.simClock,
  tables.auditEvent,
  tables.payQueue,
  tables.ledgerBalances,
  tables.journal,
  tables.health,
];

export function subscribeAll(conn: Conn, timeoutMs = 20_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Subscription timed out")), timeoutMs);
    conn
      .subscriptionBuilder()
      .onApplied(() => {
        clearTimeout(timer);
        resolve();
      })
      .onError((ctx) => {
        clearTimeout(timer);
        reject(ctx.event ?? new Error("Subscription error"));
      })
      .subscribe(ALL_TABLES);
  });
}

/** Polls the local cache until `pred` holds. Reducer results and row updates can land a tick apart. */
export async function waitFor<T>(pred: () => T | null | undefined | false, what: string, timeoutMs = 10_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = pred();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** The reducer's own refusal message, without SDK wrapping. */
export function reason(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/^.*?Refused:/, "Refused:");
}
