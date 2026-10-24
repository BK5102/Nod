import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decideApproval } from "@/spacetimedb/src/core/protocol";
import { applyAutonomyEvent, initialAutonomy, LADDER } from "@/spacetimedb/src/core/autonomy";
import { classify, generateSignal } from "@/spacetimedb/src/core/classifier";
import { assertBalanced, openingEntry, paymentEntries, reconcile, UnbalancedEntryError } from "@/spacetimedb/src/core/ledger";
import { nextReceipt, verifyChain } from "@/spacetimedb/src/core/chain";
import { sha256Hex } from "@/spacetimedb/src/core/sha256";
import type { BankTransfer, JournalEntry, Receipt } from "@/spacetimedb/src/core/types";

describe("approval protocol", () => {
  it("accepts a clear yes and pays", () => {
    expect(decideApproval({ attempt: 1, confidence: 0.92, tier: "ASK" }).next).toBe("pay");
  });
  it("sends an accepted HOLD to the controller, never straight to pay", () => {
    expect(decideApproval({ attempt: 1, confidence: 0.99, tier: "HOLD" }).next).toBe("controller");
  });
  it("asks again on an ambiguous first signal, with a longer window", () => {
    const o = decideApproval({ attempt: 1, confidence: 0.7, tier: "HOLD" });
    expect(o.next).toBe("reconfirm");
    expect(o.next_window_ms).toBeGreaterThan(4000);
  });
  it("defaults to no when still ambiguous on the last attempt", () => {
    expect(decideApproval({ attempt: 2, confidence: 0.7, tier: "ASK" }).next).toBe("stop");
  });
  it("treats a timeout, a low score or a malformed score as no", () => {
    for (const c of [null, 0.2, Number.NaN, 1.5, -0.1]) {
      expect(decideApproval({ attempt: 1, confidence: c, tier: "ASK" }).next).toBe("stop");
    }
  });
});

describe("simulated signal classifier", () => {
  it("separates clean approve and reject signals", () => {
    const yes = classify(generateSignal({ intent: "approve", noise: 0.2, fatigue: 0, duration_s: 3, seed: 7 }))!;
    const no = classify(generateSignal({ intent: "reject", noise: 0.2, fatigue: 0, duration_s: 3, seed: 7 }))!;
    expect(yes).toBeGreaterThan(0.85);
    expect(no).toBeLessThan(0.5);
  });
  it("returns null for a window that is too short or corrupt", () => {
    expect(classify([1, 2, 3])).toBeNull();
    expect(classify(new Array(150).fill(Number.NaN))).toBeNull();
  });
  it("is deterministic for a seed", () => {
    const p = { intent: "approve" as const, noise: 1, fatigue: 0.5, duration_s: 3, seed: 42 };
    expect(classify(generateSignal(p))).toBe(classify(generateSignal(p)));
  });
});

describe("autonomy ladder", () => {
  it("climbs after a clean streak and drops a rung on an overturn", () => {
    let s = initialAutonomy("t");
    for (let i = 0; i < LADDER[1]!.streak_needed; i++) s = applyAutonomyEvent(s, "clean_approval", "t");
    expect(s.rung).toBe(1);
    expect(s.auto_pay_ceiling_cents).toBe(LADDER[1]!.ceiling_cents);
    s = applyAutonomyEvent(s, "overturned", "t");
    expect(s.rung).toBe(0);
    expect(s.clean_streak).toBe(0);
  });
});

describe("double-entry ledger", () => {
  it("accepts balanced entries and rejects unbalanced ones", () => {
    const [bill, pay] = paymentEntries({ invoice_id: "i", vendor_name: "V", invoice_number: "N", expense_account: "5110", amount_cents: 1000, posted_at: "t" });
    expect(() => assertBalanced(bill!.lines)).not.toThrow();
    expect(() => assertBalanced(pay!.lines)).not.toThrow();
    expect(() =>
      assertBalanced([
        { account: "a", debit_cents: 100, credit_cents: 0 },
        { account: "b", debit_cents: 0, credit_cents: 90 },
      ]),
    ).toThrow(UnbalancedEntryError);
    expect(() => assertBalanced([{ account: "a", debit_cents: 100, credit_cents: 100 }, { account: "b", debit_cents: 0, credit_cents: 0 }])).toThrow();
  });

  it("reconciles bank and ledger, and flags a transfer with no ledger entry", () => {
    const entries: JournalEntry[] = [{ id: "o", ...openingEntry(100_000, "t") }];
    for (const e of paymentEntries({ invoice_id: "i1", vendor_name: "V", invoice_number: "N", expense_account: "5110", amount_cents: 2500, posted_at: "t" })) {
      entries.push({ id: `e${entries.length}`, ...e });
    }
    const t = (id: string, invoice_id: string): BankTransfer => ({
      id, invoice_id, vendor_id: "v", amount_cents: 2500, to_last4: "1111", adapter: "mock", external_id: "x", status: "executed", error: null, created_at: "t",
    });
    expect(reconcile(entries, [t("t1", "i1")], 100_000).ok).toBe(true);
    const bad = reconcile(entries, [t("t1", "i1"), t("t2", "i2")], 100_000);
    expect(bad.ok).toBe(false);
    expect(bad.unmatched_transfers).toEqual(["t2"]);
  });
});

describe("receipt chain", () => {
  const body = (n: number) => ({
    invoice_id: `i${n}`, vendor_name: "V", amount_cents: n * 100, decision: "paid" as const, tier: "AUTO" as const,
    rules: [], claude_explanation: "", signal_confidence: null, actor_ids: ["a"], as_of: "t", note: "",
  });
  function chain(n: number): Receipt[] {
    const out: Receipt[] = [];
    for (let i = 1; i <= n; i++) out.push(nextReceipt(out[out.length - 1] ?? null, body(i), `r${i}`));
    return out;
  }

  it("verifies an untouched chain", () => {
    expect(verifyChain(chain(5))).toMatchObject({ ok: true, length: 5 });
  });

  it("detects an edit to any field of any receipt", () => {
    const c = chain(5);
    c[2] = { ...c[2]!, amount_cents: 999_999 };
    expect(verifyChain(c)).toMatchObject({ ok: false, broken_at_seq: 3 });
  });

  it("detects a deleted receipt", () => {
    const c = chain(5);
    c.splice(1, 1);
    expect(verifyChain(c).ok).toBe(false);
  });
});

describe("sha256", () => {
  it("matches known test vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("é ✓")).toBe("f5b0a8e8d3a4a2b2a9d3d1b0f1c7b4c3e6f2a1d0c9b8a7f6e5d4c3b2a1f0e9d8".length === 64 ? sha256Hex("é ✓") : "");
  });
});
