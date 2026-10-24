import type { AnswerKeyRow } from "@/lib/domain/types";
import type { Mutation, World } from "./world";

export interface Store {
  readonly kind: "memory" | "supabase";
  load(): Promise<World>;
  apply(muts: readonly Mutation[]): Promise<void>;
  /** Replaces everything. Used only by the demo reset and the seed script. */
  replaceAll(world: World, answerKey: readonly AnswerKeyRow[]): Promise<void>;
  /** Eval only. Agent code paths must never call this; tests/separation.test.ts checks. */
  loadAnswerKey(): Promise<AnswerKeyRow[]>;
  /** Cheap read used by the health check. */
  ping(): Promise<{ ok: boolean; detail: string }>;
}

let cached: Store | null = null;

export async function getStore(): Promise<Store> {
  if (cached) return cached;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { SupabaseStore } = await import("./supabase-store");
    cached = new SupabaseStore(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  } else {
    const { MemoryStore } = await import("./memory-store");
    cached = MemoryStore.shared();
  }
  return cached;
}

/** For tests and scripts that want an explicit store. */
export function setStore(store: Store | null): void {
  cached = store;
}
