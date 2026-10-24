// Builds a small model of real vendor payments from the City and County of San Francisco's
// "Vendor Payments (Vouchers)" dataset (data.sfgov.org, id n9pm-xkyq), which is published under the
// Open Data Commons Public Domain Dedication and License.
//
// What it takes from the public data: the payment categories (sub-object), the real distribution of
// paid amounts in each category, the fiscal year, and the shape of voucher and purchase order numbers.
// What it does NOT take: supplier names. We generate invoices and a scam email, and a real company's
// name must never appear on a document we generated. Vendor names stay fictional.
//
// Writes data/public-model.json, which scripts/seed.ts reads. If the download fails, it writes
// nothing and the seed keeps its GENERATED amounts.
// Usage: pnpm tsx scripts/seed-public.ts
import fs from "node:fs";

const DATASET = "n9pm-xkyq";
const BASE = `https://data.sfgov.org/resource/${DATASET}.json`;
const FY = "2025";
const CATEGORIES = [
  { key: "produce", subObject: "Food", vendorId: "ven_harbor" },
  { key: "dairy", subObject: "Food", vendorId: "ven_dairy" },
  { key: "printing", subObject: "Printing", vendorId: "ven_bayline" },
  { key: "cleaning", subObject: "Janitorial Services", vendorId: "ven_clean" },
] as const;

interface Row {
  vouchers_paid?: string;
  voucher?: string;
  purchase_order?: string;
  sub_object?: string;
}

async function fetchRows(subObject: string, limit = 4000): Promise<Row[]> {
  const where = encodeURIComponent(`fiscal_year='${FY}' AND sub_object='${subObject}' AND vouchers_paid > 0`);
  const url = `${BASE}?$select=vouchers_paid,voucher,purchase_order,sub_object&$where=${where}&$limit=${limit}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Row[];
  } finally {
    clearTimeout(timer);
  }
}

function quantile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return Math.round((sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo)) * 100) / 100;
}

async function main() {
  console.log(`Downloading FY${FY} vouchers from data.sfgov.org (${DATASET})...`);
  const byCategory: Record<string, { subObject: string; count: number; p10: number; p25: number; p50: number; p75: number; p90: number }> = {};
  const formats = { voucherDigits: 0, poDigits: 0 };
  const cache = new Map<string, Row[]>();
  for (const c of CATEGORIES) {
    const rows = cache.get(c.subObject) ?? (await fetchRows(c.subObject));
    cache.set(c.subObject, rows);
    const amounts = rows.map((r) => Number(r.vouchers_paid)).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
    if (amounts.length < 20) throw new Error(`Too few rows for ${c.subObject}: ${amounts.length}`);
    byCategory[c.key] = {
      subObject: c.subObject,
      count: amounts.length,
      p10: quantile(amounts, 0.1),
      p25: quantile(amounts, 0.25),
      p50: quantile(amounts, 0.5),
      p75: quantile(amounts, 0.75),
      p90: quantile(amounts, 0.9),
    };
    const v = rows.find((r) => r.voucher)?.voucher ?? "";
    const p = rows.find((r) => r.purchase_order)?.purchase_order ?? "";
    formats.voucherDigits = Math.max(formats.voucherDigits, v.length);
    formats.poDigits = Math.max(formats.poDigits, p.length);
    console.log(`  ${c.key.padEnd(9)} ${c.subObject.padEnd(20)} n=${amounts.length}  p25 $${byCategory[c.key]!.p25}  median $${byCategory[c.key]!.p50}  p75 $${byCategory[c.key]!.p75}`);
  }
  const model = {
    source: {
      title: "Vendor Payments (Vouchers)",
      publisher: "City and County of San Francisco, Controller's Office",
      url: `https://data.sfgov.org/d/${DATASET}`,
      license: "Open Data Commons Public Domain Dedication and License",
      fiscal_year: FY,
      downloaded_at: new Date().toISOString(),
    },
    uses: "Payment categories, the distribution of paid amounts per category, the fiscal year, and voucher and PO number formats. Not supplier names.",
    categories: byCategory,
    formats,
  };
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/public-model.json", JSON.stringify(model, null, 2) + "\n");
  console.log("Wrote data/public-model.json");
}

main().catch((e) => {
  console.error(`Public data download failed: ${(e as Error).message}. The seed keeps its GENERATED amounts.`);
  process.exit(1);
});
