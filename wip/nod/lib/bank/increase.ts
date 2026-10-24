import { sandboxAccountNumber, type BankAdapter, type PayRequest, type PayResult } from "./adapter";

/**
 * Increase sandbox. Verified against increase.com/documentation (Oct 2026):
 *   POST {base}/ach_transfers  body { account_id, amount (cents), statement_descriptor, account_number, routing_number }
 *   Authorization: Bearer <key>, Idempotency-Key: <key>
 *   POST {base}/simulations/ach_transfers/{id}/settle  settles a sandbox transfer immediately.
 * Server-side only.
 */
export class IncreaseBank implements BankAdapter {
  readonly name = "Increase sandbox";
  readonly sandbox = true;

  constructor(
    private readonly apiKey: string,
    private readonly accountId: string,
    private readonly baseUrl = "https://sandbox.increase.com",
    private readonly outage: () => boolean = () => false,
  ) {}

  private headers(idem?: string): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      ...(idem ? { "Idempotency-Key": idem } : {}),
    };
  }

  async pay(req: PayRequest): Promise<PayResult> {
    if (this.outage()) return { ok: false, adapter: this.name, error: "Bank unreachable (simulated outage)", retryable: true };
    try {
      const res = await fetch(`${this.baseUrl}/ach_transfers`, {
        method: "POST",
        headers: this.headers(req.idempotency_key),
        body: JSON.stringify({
          account_id: this.accountId,
          amount: req.amount_cents,
          statement_descriptor: req.memo.slice(0, 200),
          account_number: sandboxAccountNumber(req.to.last4),
          routing_number: "101050001",
          company_name: "Eastbay Community Pantry",
          individual_name: req.to.name.slice(0, 22),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; title?: string; detail?: string };
      if (!res.ok || !body.id) {
        return {
          ok: false,
          adapter: this.name,
          error: `Increase ${res.status}: ${body.title ?? body.detail ?? "unknown error"}`,
          retryable: res.status >= 500 || res.status === 429,
        };
      }
      // Sandbox only: settle now so the demo does not wait on the ACH schedule. Failure here is not fatal.
      await fetch(`${this.baseUrl}/simulations/ach_transfers/${body.id}/settle`, {
        method: "POST",
        headers: this.headers(),
        body: "{}",
        signal: AbortSignal.timeout(10_000),
      }).catch(() => undefined);
      return { ok: true, external_id: body.id, adapter: this.name };
    } catch (e) {
      return { ok: false, adapter: this.name, error: `Increase unreachable: ${(e as Error).message}`, retryable: true };
    }
  }

  async ping() {
    try {
      const res = await fetch(`${this.baseUrl}/accounts/${this.accountId}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5_000),
      });
      return { ok: res.ok, detail: res.ok ? "Increase sandbox reachable" : `Increase ${res.status}` };
    } catch (e) {
      return { ok: false, detail: `Increase unreachable: ${(e as Error).message}` };
    }
  }
}
