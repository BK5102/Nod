export interface PayRequest {
  /** Stable per invoice, so a retry after a timeout can never pay twice. */
  idempotency_key: string;
  amount_cents: number;
  to: { name: string; last4: string };
  memo: string;
}

export type PayResult =
  | { ok: true; external_id: string; adapter: string }
  | { ok: false; adapter: string; error: string; retryable: boolean };

export interface BankAdapter {
  readonly name: string;
  /** True when the adapter talks to a real sandbox, false for the in-process mock. */
  readonly sandbox: boolean;
  pay(req: PayRequest): Promise<PayResult>;
  ping(): Promise<{ ok: boolean; detail: string }>;
}

/** Sandbox account number for a vendor. Only the last four digits are shown anywhere in the UI. */
export function sandboxAccountNumber(last4: string): string {
  return `55500${last4}`;
}
