import { sha256Hex } from "./sha256";

export const GENESIS_HASH = "0".repeat(64);

/** The signed part of a receipt. Field names match the receipt table, so rows hash directly. */
export interface ReceiptBody {
  seq: number;
  tripId: string;
  action: string;
  offerId: string;
  merchant: string;
  amountCents: number;
  tier: string;
  rulesJson: string;
  actor: string;
  quoteHash: string;
  tokenLast4: string;
  at: string;
}

export interface ReceiptRow extends ReceiptBody {
  prevHash: string;
  hash: string;
}

/** JSON with sorted keys, so the same receipt always hashes the same way. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function bodyOf(r: ReceiptBody): ReceiptBody {
  return {
    seq: r.seq,
    tripId: r.tripId,
    action: r.action,
    offerId: r.offerId,
    merchant: r.merchant,
    amountCents: r.amountCents,
    tier: r.tier,
    rulesJson: r.rulesJson,
    actor: r.actor,
    quoteHash: r.quoteHash,
    tokenLast4: r.tokenLast4,
    at: r.at,
  };
}

export function hashReceipt(prevHash: string, body: ReceiptBody): string {
  return sha256Hex(`${prevHash}\n${canonicalJson(bodyOf(body))}`);
}

/** Walks the chain in seq order. Any edit to any field of any receipt breaks it from that point on. */
export function verifyReceipts(rows: readonly ReceiptRow[]): { ok: boolean; reason: string | null } {
  const sorted = [...rows].sort((a, b) => a.seq - b.seq);
  let prev = GENESIS_HASH;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]!;
    if (r.seq !== i + 1) return { ok: false, reason: `Sequence gap at ${r.seq}` };
    if (r.prevHash !== prev) return { ok: false, reason: `prevHash does not match at ${r.seq}` };
    if (hashReceipt(prev, r) !== r.hash) return { ok: false, reason: `Contents changed after signing at ${r.seq}` };
    prev = r.hash;
  }
  return { ok: true, reason: null };
}
