import type { ExtractedInvoice } from "@/spacetimedb/src/core/types";

export interface NaiveOutcome {
  amount_cents: number;
  to_last4: string;
  /** True when the naive agent paid an account that is not the one on file. */
  wrong_account: boolean;
}

/**
 * The baseline: an agent that pays every invoice, in full, to whatever account the invoice names.
 * No tiers, no second review, no person. Shown beside Nod on the same invoice.
 */
export function naivePay(x: ExtractedInvoice, accountOnFile: string | null): NaiveOutcome {
  const to = x.remit_bank_last4 ?? accountOnFile ?? "????";
  return { amount_cents: x.amount_cents, to_last4: to, wrong_account: !!accountOnFile && to !== accountOnFile };
}
