import type { BankAdapter, PayRequest, PayResult } from "./adapter";

/**
 * Capital One Nessie. NOT VERIFIED: the docs at api.nessieisreal.com were unreachable when this
 * was written. The shape below follows the public Nessie API as commonly documented
 * (key as a query parameter; POST /accounts/{id}/transfers with medium, payee_id, amount in dollars).
 * Each vendor must exist as a Nessie account; NESSIE_VENDOR_ACCOUNTS maps last4 -> payee account id.
 * Run `pnpm tsx scripts/nessie-check.ts` before relying on it. Server-side only.
 */
export class NessieBank implements BankAdapter {
  readonly name = "Capital One Nessie";
  readonly sandbox = true;

  constructor(
    private readonly apiKey: string,
    private readonly accountId: string,
    private readonly payees: Record<string, string>,
    private readonly baseUrl = "http://api.nessieisreal.com",
    private readonly outage: () => boolean = () => false,
  ) {}

  async pay(req: PayRequest): Promise<PayResult> {
    if (this.outage()) return { ok: false, adapter: this.name, error: "Bank unreachable (simulated outage)", retryable: true };
    const payee = this.payees[req.to.last4];
    if (!payee) {
      return { ok: false, adapter: this.name, error: `No Nessie payee for account ending ${req.to.last4}`, retryable: false };
    }
    try {
      const res = await fetch(`${this.baseUrl}/accounts/${this.accountId}/transfers?key=${encodeURIComponent(this.apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medium: "balance",
          payee_id: payee,
          amount: req.amount_cents / 100,
          transaction_date: new Date().toISOString().slice(0, 10),
          description: `${req.memo} [${req.idempotency_key}]`.slice(0, 200),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await res.json().catch(() => ({}))) as { objectCreated?: { _id?: string }; message?: string };
      const id = body.objectCreated?._id;
      if (!res.ok || !id) {
        return { ok: false, adapter: this.name, error: `Nessie ${res.status}: ${body.message ?? "unknown"}`, retryable: res.status >= 500 };
      }
      return { ok: true, external_id: id, adapter: this.name };
    } catch (e) {
      return { ok: false, adapter: this.name, error: `Nessie unreachable: ${(e as Error).message}`, retryable: true };
    }
  }

  async ping() {
    try {
      const res = await fetch(`${this.baseUrl}/accounts/${this.accountId}?key=${encodeURIComponent(this.apiKey)}`, {
        signal: AbortSignal.timeout(5_000),
      });
      return { ok: res.ok, detail: res.ok ? "Nessie reachable" : `Nessie ${res.status}` };
    } catch (e) {
      return { ok: false, detail: `Nessie unreachable: ${(e as Error).message}` };
    }
  }
}
