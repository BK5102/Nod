import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "@/spacetimedb/src/core/engine";
import { maxTier, mergeClaudeFlags, tierRank } from "@/spacetimedb/src/core/tiers";
import type { ClaudeFlag, Tier } from "@/spacetimedb/src/core/types";
import { AS_OF, cleanInput, extracted, vendor } from "./fixtures";

const fired = (r: ReturnType<typeof evaluatePolicy>) => r.rules.filter((x) => x.fired).map((x) => x.id);

describe("policy engine", () => {
  it("pays a clean invoice automatically", () => {
    const r = evaluatePolicy(cleanInput());
    expect(fired(r)).toEqual([]);
    expect(r.tier).toBe("AUTO");
  });

  it("holds when the invoice asks for a different bank account", () => {
    const x = extracted({ remit_bank_last4: "7731" });
    const r = evaluatePolicy(cleanInput({ invoice: { ...cleanInput().invoice, extracted: x } }));
    expect(fired(r)).toContain("bank_change");
    expect(r.tier).toBe("HOLD");
  });

  it("holds when bank details changed within the window", () => {
    const v = { ...vendor, bank_changed_at: "2026-06-22T09:00:00.000Z" };
    const r = evaluatePolicy(cleanInput({ vendor: v }));
    expect(r.rules.find((x) => x.id === "bank_change")?.reason).toMatch(/changed on 2026-06-22/);
    expect(r.tier).toBe("HOLD");
  });

  it("holds a duplicate invoice number", () => {
    const r = evaluatePolicy(
      cleanInput({ history: [{ id: "old", invoice_number: "HP-2000", amount_cents: 5, received_at: "2026-06-01T00:00:00.000Z", status: "paid" }] }),
    );
    expect(fired(r)).toContain("duplicate");
    expect(r.tier).toBe("HOLD");
  });

  it("holds a same-amount invoice inside the duplicate window", () => {
    const r = evaluatePolicy(
      cleanInput({ history: [{ id: "old", invoice_number: "HP-1", amount_cents: 121_500, received_at: "2026-06-18T00:00:00.000Z", status: "paid" }] }),
    );
    expect(fired(r)).toContain("duplicate");
  });

  it("holds over the hard cap", () => {
    const x = extracted({ amount_cents: 1_200_000, line_items: [] });
    const r = evaluatePolicy(cleanInput({ invoice: { ...cleanInput().invoice, amount_cents: 1_200_000, extracted: x } }));
    expect(fired(r)).toContain("hard_cap");
    expect(r.tier).toBe("HOLD");
  });

  it("holds an email from a look-alike domain", () => {
    const x = extracted({ sender_email: "billing@harborproduce-payments.com" });
    const r = evaluatePolicy(cleanInput({ invoice: { ...cleanInput().invoice, extracted: x } }));
    expect(fired(r)).toContain("sender_domain");
    expect(r.tier).toBe("HOLD");
  });

  it("asks for an unknown vendor", () => {
    const r = evaluatePolicy(cleanInput({ vendor: null, po: null, contract: null, po_remaining_cents: null }));
    expect(fired(r)).toContain("new_vendor");
    expect(r.tier).toBe("ASK");
  });

  it("asks for a vendor added inside the new-vendor period", () => {
    const r = evaluatePolicy(cleanInput({ vendor: { ...vendor, first_seen_at: "2026-06-01T00:00:00.000Z" } }));
    expect(fired(r)).toEqual(["new_vendor"]);
  });

  it("asks when the bill runs past what is left on the PO", () => {
    const r = evaluatePolicy(cleanInput({ po_remaining_cents: 50_000 }));
    expect(fired(r)).toContain("po_match");
    expect(r.tier).toBe("ASK");
  });

  it("asks when there is no PO", () => {
    const r = evaluatePolicy(cleanInput({ po: null, po_remaining_cents: null }));
    expect(fired(r)).toContain("po_match");
  });

  it("asks when a unit price is above contract", () => {
    const x = extracted({
      line_items: [{ description: "Mixed produce case", quantity: 40, unit_price_cents: 3400, amount_cents: 136_000 }],
      amount_cents: 136_000,
    });
    const r = evaluatePolicy(cleanInput({ invoice: { ...cleanInput().invoice, amount_cents: 136_000, extracted: x } }));
    expect(fired(r)).toContain("contract_price");
  });

  it("asks when line items do not add up to the total", () => {
    const x = extracted({ amount_cents: 321_000 });
    const r = evaluatePolicy(cleanInput({ invoice: { ...cleanInput().invoice, amount_cents: 321_000, extracted: x } }));
    expect(fired(r)).toContain("line_items");
  });

  it("asks on velocity", () => {
    const h = [1, 2, 3].map((d) => ({ id: `h${d}`, invoice_number: `HP-${d}`, amount_cents: d * 1000, received_at: `2026-06-2${d - 1}T00:00:00.000Z`, status: "paid" as const }));
    const r = evaluatePolicy(cleanInput({ history: h }));
    expect(fired(r)).toContain("velocity");
  });

  it("asks on a rush due date", () => {
    const r = evaluatePolicy(cleanInput({ invoice: { ...cleanInput().invoice, due_date: "2026-06-24T00:00:00.000Z" } }));
    expect(fired(r)).toContain("rush");
  });

  it("asks while a vendor is under stricter review from an earlier stop", () => {
    const r = evaluatePolicy(cleanInput({ vendor: { ...vendor, heightened_until: "2026-07-07T00:00:00.000Z" } }));
    expect(fired(r)).toEqual(["heightened"]);
  });

  it("asks when autonomy has not been earned", () => {
    const r = evaluatePolicy(cleanInput({ autonomy: { auto_pay_ceiling_cents: 0, rung: 0 } }));
    expect(fired(r)).toEqual(["autonomy"]);
    expect(r.tier).toBe("ASK");
  });

  it("gives every rule a plain-language reason", () => {
    const r = evaluatePolicy(cleanInput());
    for (const rule of r.rules) expect(rule.reason.length).toBeGreaterThan(5);
    expect(AS_OF).toBeTruthy();
  });
});

describe("tier ordering and the Claude merge", () => {
  const tiers: Tier[] = ["AUTO", "ASK", "HOLD"];

  it("orders AUTO < ASK < HOLD", () => {
    expect(tiers.map(tierRank)).toEqual([0, 1, 2]);
    expect(maxTier("ASK", "AUTO", "HOLD")).toBe("HOLD");
    expect(maxTier()).toBe("AUTO");
  });

  it("can only raise the tier, never lower it, for every combination of flags", () => {
    const flagSets: ClaudeFlag[][] = [
      [],
      [{ code: "a", severity: "ASK", reason: "" }],
      [{ code: "h", severity: "HOLD", reason: "" }],
      [
        { code: "a", severity: "ASK", reason: "" },
        { code: "h", severity: "HOLD", reason: "" },
      ],
      // A malformed severity smuggled in as AUTO must still not lower anything.
      [{ code: "x", severity: "AUTO" as unknown as "ASK", reason: "" }],
    ];
    for (const rule of tiers) {
      for (const flags of flagSets) {
        const merged = mergeClaudeFlags(rule, flags);
        expect(tierRank(merged)).toBeGreaterThanOrEqual(tierRank(rule));
      }
    }
  });

  it("an invoice that says to approve itself cannot lower a HOLD", () => {
    expect(mergeClaudeFlags("HOLD", [])).toBe("HOLD");
  });
});
