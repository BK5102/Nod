import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProofTable } from "@/lib/proof";

describe("proof table", () => {
  it("CLAUDE.md yields every row the What is real panel shows, with simulated parts labeled", () => {
    const rows = parseProofTable(fs.readFileSync("CLAUDE.md", "utf8"));
    expect(rows.length).toBeGreaterThanOrEqual(8);
    const byName = Object.fromEntries(rows.map((r) => [r.component, r.status]));
    expect(byName["Approval signal"]).toMatch(/^Simulated/);
    expect(byName["Bank"]).toMatch(/^Simulated/);
    expect(byName["Vendors and seeded invoices"]).toMatch(/SEEDED/);
    expect(byName["Receipts"]).toMatch(/^Real/);
  });
});
