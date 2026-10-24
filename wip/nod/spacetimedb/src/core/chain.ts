import { sha256Hex } from "./sha256";
import type { Receipt, ReceiptBody } from "./types";

export const GENESIS_HASH = "0".repeat(64);

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

export function hashReceipt(prev_hash: string, body: ReceiptBody): string {
  return sha256Hex(`${prev_hash}\n${canonicalJson(body)}`);
}

export function bodyOf(r: Receipt): ReceiptBody {
  return {
    seq: r.seq,
    invoice_id: r.invoice_id,
    vendor_name: r.vendor_name,
    amount_cents: r.amount_cents,
    decision: r.decision,
    tier: r.tier,
    rules: r.rules,
    claude_explanation: r.claude_explanation,
    signal_confidence: r.signal_confidence,
    actor_ids: r.actor_ids,
    as_of: r.as_of,
    note: r.note,
  };
}

export function nextReceipt(prev: Receipt | null, body: Omit<ReceiptBody, "seq">, id: string): Receipt {
  const full: ReceiptBody = { ...body, seq: (prev?.seq ?? 0) + 1 };
  const prev_hash = prev?.hash ?? GENESIS_HASH;
  return { ...full, id, prev_hash, hash: hashReceipt(prev_hash, full) };
}

export interface ChainCheck {
  ok: boolean;
  length: number;
  broken_at_seq: number | null;
  reason: string | null;
}

/** Walks the chain in seq order. Any edit to any field of any receipt breaks it from that point on. */
export function verifyChain(receipts: readonly Receipt[]): ChainCheck {
  const sorted = [...receipts].sort((a, b) => a.seq - b.seq);
  let prev = GENESIS_HASH;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]!;
    if (r.seq !== i + 1) return { ok: false, length: sorted.length, broken_at_seq: r.seq, reason: "Sequence gap" };
    if (r.prev_hash !== prev) return { ok: false, length: sorted.length, broken_at_seq: r.seq, reason: "prev_hash does not match" };
    if (hashReceipt(prev, bodyOf(r)) !== r.hash)
      return { ok: false, length: sorted.length, broken_at_seq: r.seq, reason: "Contents changed after signing" };
    prev = r.hash;
  }
  return { ok: true, length: sorted.length, broken_at_seq: null, reason: null };
}
