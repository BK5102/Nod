import { Providers } from "../providers";
import { SpikeNotes } from "./SpikeNotes";

export const metadata = { title: "Nod: SpacetimeDB spike" };

export default function SpikePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-8">
      <h1 className="text-3xl font-bold">SpacetimeDB spike</h1>
      <p className="mt-3 max-w-[65ch] text-ink-soft">
        Rows written by a reducer appear here through a live subscription, with no polling and no reload.
      </p>
      <Providers>
        <SpikeNotes />
      </Providers>
    </main>
  );
}
