export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-8">
      <h1 className="text-5xl font-bold tracking-tight">Nod</h1>
      <p className="mt-4 max-w-[60ch] text-xl">
        An AI bookkeeper that pays the routine bills and asks a person before anything risky.
      </p>
      <p className="mt-6 max-w-[65ch] leading-relaxed text-ink-soft">
        Nod is an AI bookkeeper for small nonprofits. It pays routine bills by itself and stops to ask a person
        before anything that looks risky. It still works safely when the person approving can only send one slow,
        shaky signal, because it treats that signal as a hint, not a final yes. Every decision gets a receipt
        showing who approved what and how sure they were.
      </p>
      <p className="mt-10 border-t border-rule pt-4 text-sm text-ink-soft">
        Prototype built at Cal Hacks 13.0. The approval signal is simulated. Eastbay Community Pantry is a
        fictional company.
      </p>
    </main>
  );
}
