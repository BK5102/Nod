import type { BankAdapter } from "./adapter";
import { IncreaseBank } from "./increase";
import { MockBank } from "./mock";
import { NessieBank } from "./nessie";

/**
 * Picks the bank from BANK_ADAPTER (mock | increase | nessie). If the sandbox is configured but
 * missing keys, uses MockBank and says so in `fallback_reason`, which the UI shows.
 */
export function makeBank(outage: () => boolean): { bank: BankAdapter; fallback_reason: string | null } {
  const choice = (process.env.BANK_ADAPTER ?? "mock").toLowerCase();
  if (choice === "increase") {
    const key = process.env.INCREASE_API_KEY;
    const acct = process.env.INCREASE_ACCOUNT_ID;
    if (key && acct) return { bank: new IncreaseBank(key, acct, process.env.INCREASE_BASE_URL, outage), fallback_reason: null };
    return { bank: new MockBank(outage), fallback_reason: "BANK_ADAPTER=increase but INCREASE_API_KEY or INCREASE_ACCOUNT_ID is missing" };
  }
  if (choice === "nessie") {
    const key = process.env.NESSIE_API_KEY;
    const acct = process.env.NESSIE_ACCOUNT_ID;
    let payees: Record<string, string> = {};
    try {
      payees = JSON.parse(process.env.NESSIE_VENDOR_ACCOUNTS ?? "{}") as Record<string, string>;
    } catch {
      payees = {};
    }
    if (key && acct) return { bank: new NessieBank(key, acct, payees, undefined, outage), fallback_reason: null };
    return { bank: new MockBank(outage), fallback_reason: "BANK_ADAPTER=nessie but NESSIE_API_KEY or NESSIE_ACCOUNT_ID is missing" };
  }
  return { bank: new MockBank(outage), fallback_reason: null };
}
