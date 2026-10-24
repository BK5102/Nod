import { createHash } from "node:crypto";
import type { BankAdapter, PayRequest, PayResult } from "./adapter";

/**
 * In-process bank. Deterministic transfer ids derived from the idempotency key, so replaying the
 * same request returns the same transfer. `outage` makes every call fail, for the recovery demo.
 */
export class MockBank implements BankAdapter {
  readonly name = "MockBank";
  readonly sandbox = false;
  private seen = new Map<string, string>();

  constructor(private readonly outage: () => boolean = () => false) {}

  async pay(req: PayRequest): Promise<PayResult> {
    if (this.outage()) {
      return { ok: false, adapter: this.name, error: "Bank unreachable (simulated outage)", retryable: true };
    }
    if (!Number.isInteger(req.amount_cents) || req.amount_cents <= 0) {
      return { ok: false, adapter: this.name, error: "Invalid amount", retryable: false };
    }
    const existing = this.seen.get(req.idempotency_key);
    if (existing) return { ok: true, external_id: existing, adapter: this.name };
    const id = `mock_tr_${createHash("sha256").update(req.idempotency_key).digest("hex").slice(0, 16)}`;
    this.seen.set(req.idempotency_key, id);
    return { ok: true, external_id: id, adapter: this.name };
  }

  async ping() {
    return this.outage() ? { ok: false, detail: "simulated outage" } : { ok: true, detail: "in-process mock" };
  }
}
