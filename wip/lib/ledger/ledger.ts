import type { BankTransfer, JournalEntry, JournalLine } from "@/lib/domain/types";

export const ACCOUNTS = {
  cash: "1000 Cash - operating bank",
  ap: "2000 Accounts payable",
  net_assets: "3000 Net assets",
} as const;

export class UnbalancedEntryError extends Error {
  constructor(public readonly debits: number, public readonly credits: number) {
    super(`Journal entry does not balance: debits ${debits} vs credits ${credits}`);
  }
}

export function totals(lines: readonly JournalLine[]): { debits: number; credits: number } {
  return lines.reduce(
    (acc, l) => ({ debits: acc.debits + l.debit_cents, credits: acc.credits + l.credit_cents }),
    { debits: 0, credits: 0 },
  );
}

/** Throws unless debits equal credits, every line is one-sided and non-negative, and there are 2+ lines. */
export function assertBalanced(lines: readonly JournalLine[]): void {
  if (lines.length < 2) throw new UnbalancedEntryError(0, 0);
  for (const l of lines) {
    const ok =
      Number.isInteger(l.debit_cents) &&
      Number.isInteger(l.credit_cents) &&
      l.debit_cents >= 0 &&
      l.credit_cents >= 0 &&
      (l.debit_cents === 0) !== (l.credit_cents === 0);
    if (!ok) throw new UnbalancedEntryError(l.debit_cents, l.credit_cents);
  }
  const t = totals(lines);
  if (t.debits !== t.credits || t.debits === 0) throw new UnbalancedEntryError(t.debits, t.credits);
}

/** Recognize the bill and pay it: expense up, payable cleared, cash down. Two balanced entries. */
export function paymentEntries(args: {
  invoice_id: string;
  vendor_name: string;
  invoice_number: string;
  expense_account: string;
  amount_cents: number;
  posted_at: string;
}): Omit<JournalEntry, "id">[] {
  const { invoice_id, vendor_name, invoice_number, expense_account, amount_cents, posted_at } = args;
  return [
    {
      invoice_id,
      memo: `Bill ${invoice_number} from ${vendor_name}`,
      posted_at,
      lines: [
        { account: expense_account, debit_cents: amount_cents, credit_cents: 0 },
        { account: ACCOUNTS.ap, debit_cents: 0, credit_cents: amount_cents },
      ],
    },
    {
      invoice_id,
      memo: `Payment of ${invoice_number} to ${vendor_name}`,
      posted_at,
      lines: [
        { account: ACCOUNTS.ap, debit_cents: amount_cents, credit_cents: 0 },
        { account: ACCOUNTS.cash, debit_cents: 0, credit_cents: amount_cents },
      ],
    },
  ];
}

export function openingEntry(amount_cents: number, posted_at: string): Omit<JournalEntry, "id"> {
  return {
    invoice_id: null,
    memo: "Opening balance",
    posted_at,
    lines: [
      { account: ACCOUNTS.cash, debit_cents: amount_cents, credit_cents: 0 },
      { account: ACCOUNTS.net_assets, debit_cents: 0, credit_cents: amount_cents },
    ],
  };
}

export function accountBalances(entries: readonly JournalEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) {
    for (const l of e.lines) m.set(l.account, (m.get(l.account) ?? 0) + l.debit_cents - l.credit_cents);
  }
  return m;
}

export interface Reconciliation {
  ok: boolean;
  ledger_cash_cents: number;
  bank_cash_cents: number;
  difference_cents: number;
  entries_balanced: boolean;
  trial_balance_cents: number;
  unmatched_transfers: string[];
  unmatched_payments: string[];
}

/**
 * Bank vs ledger. The bank side is the opening balance less every executed transfer.
 * Also checks every entry balances and every executed transfer has exactly one ledger payment.
 */
export function reconcile(
  entries: readonly JournalEntry[],
  transfers: readonly BankTransfer[],
  opening_balance_cents: number,
): Reconciliation {
  const executed = transfers.filter((t) => t.status === "executed");
  const bank = opening_balance_cents - executed.reduce((a, t) => a + t.amount_cents, 0);
  const ledgerCash = accountBalances(entries).get(ACCOUNTS.cash) ?? 0;
  let balanced = true;
  let trial = 0;
  for (const e of entries) {
    const t = totals(e.lines);
    if (t.debits !== t.credits) balanced = false;
    trial += t.debits - t.credits;
  }
  const paidInvoices = new Set(
    entries.filter((e) => e.lines.some((l) => l.account === ACCOUNTS.cash && l.credit_cents > 0)).map((e) => e.invoice_id),
  );
  const transferInvoices = new Set(executed.map((t) => t.invoice_id));
  const unmatched_transfers = executed.filter((t) => !paidInvoices.has(t.invoice_id)).map((t) => t.id);
  const unmatched_payments = [...paidInvoices].filter((id): id is string => !!id && !transferInvoices.has(id));
  const difference = ledgerCash - bank;
  return {
    ok: difference === 0 && balanced && trial === 0 && unmatched_transfers.length === 0 && unmatched_payments.length === 0,
    ledger_cash_cents: ledgerCash,
    bank_cash_cents: bank,
    difference_cents: difference,
    entries_balanced: balanced,
    trial_balance_cents: trial,
    unmatched_transfers,
    unmatched_payments,
  };
}
