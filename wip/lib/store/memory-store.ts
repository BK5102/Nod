import fs from "node:fs";
import path from "node:path";
import type { AnswerKeyRow } from "@/lib/domain/types";
import type { Store } from "./store";
import { applyMutations, emptyWorld, type Mutation, type World } from "./world";

/**
 * In-process store for local development and tests. When a file path is set, every write is
 * mirrored to disk so `pnpm seed` and `pnpm dev` share state. Not for production: on Vercel,
 * configure Supabase.
 */
export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private world: World;
  private answerKey: AnswerKeyRow[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string | null = null) {
    this.world = emptyWorld(new Date().toISOString());
    if (file && fs.existsSync(file)) {
      try {
        const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { world: World; answerKey: AnswerKeyRow[] };
        this.world = raw.world;
        this.answerKey = raw.answerKey;
      } catch {
        // A corrupt file is replaced on the next write.
      }
    }
  }

  static shared(): MemoryStore {
    const g = globalThis as unknown as { __nodMemoryStore?: MemoryStore };
    if (!g.__nodMemoryStore) {
      const file = process.env.VERCEL ? null : path.join(process.cwd(), "data", "runtime-world.json");
      g.__nodMemoryStore = new MemoryStore(file);
    }
    return g.__nodMemoryStore;
  }

  private persist(): void {
    if (!this.file) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify({ world: this.world, answerKey: this.answerKey }));
      this.mtime = fs.statSync(this.file).mtimeMs;
    } catch {
      // Read-only filesystem: keep going in memory.
    }
  }

  private serial<T>(fn: () => T): Promise<T> {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private mtime = 0;

  /** Picks up writes made by another process, such as `pnpm seed` while `pnpm dev` runs. */
  private refresh(): void {
    if (!this.file) return;
    try {
      const m = fs.statSync(this.file).mtimeMs;
      if (m > this.mtime) {
        const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as { world: World; answerKey: AnswerKeyRow[] };
        this.world = raw.world;
        this.answerKey = raw.answerKey;
        this.mtime = m;
      }
    } catch {
      // No file yet.
    }
  }

  load(): Promise<World> {
    return this.serial(() => {
      this.refresh();
      return structuredClone(this.world);
    });
  }

  apply(muts: readonly Mutation[]): Promise<void> {
    return this.serial(() => {
      this.refresh();
      const next = applyMutations(structuredClone(this.world), muts);
      this.world = next;
      this.persist();
    });
  }

  replaceAll(world: World, answerKey: readonly AnswerKeyRow[]): Promise<void> {
    return this.serial(() => {
      this.world = structuredClone(world);
      this.answerKey = [...answerKey];
      this.persist();
    });
  }

  loadAnswerKey(): Promise<AnswerKeyRow[]> {
    return this.serial(() => {
      this.refresh();
      return [...this.answerKey];
    });
  }

  async ping() {
    return { ok: true, detail: `memory store, ${this.world.invoices.length} invoices` };
  }
}
