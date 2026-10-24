"use client";

import { useEffect, useRef, useState } from "react";
import type { ProofRow } from "@/lib/proof";
import { cn } from "@/lib/utils";

/** One click from every screen: what is real, what is simulated, and how we know. */
export function ProofPanel() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<ProofRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/proof")
      .then((r) => r.json())
      .then((b: { ok: boolean; result?: ProofRow[]; error?: string }) => (b.ok ? setRows(b.result ?? []) : setError(b.error ?? "Could not load")))
      .catch(() => setError("Could not load the proof table"));
  }, []);

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="rounded-md bg-tabled px-3 py-1.5 text-sm font-bold text-ink">
        What is real
      </button>
      <dialog ref={dialog} aria-labelledby="proof-h" className="m-auto w-[min(960px,calc(100vw-32px))] bg-white p-0 text-ink shadow-lg backdrop:bg-ink/40">
        <div className="p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="proof-h" className="text-xl font-bold">
              What is real and what is simulated
            </h2>
            <button type="button" onClick={() => dialog.current?.close()} className="font-bold underline">
              Close
            </button>
          </div>
          <p className="mt-1 text-sm text-ink-soft">From the proof table in CLAUDE.md. Eastbay Community Pantry is fictional; Nod is a prototype.</p>
          {error && <p className="mt-4 text-no">{error}</p>}
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-ink-soft">
                <th className="py-2 pr-3 font-normal">Part</th>
                <th className="py-2 pr-3 font-normal">Real or simulated</th>
                <th className="py-2 font-normal">How we know</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => {
                const sim = /^simulated|^a simple/i.test(r.status) || /simulated/i.test(r.status.split(":")[0] ?? "");
                return (
                  <tr key={r.component} className="border-t border-rule align-top">
                    <td className="py-2 pr-3 font-bold">{r.component}</td>
                    <td className={cn("py-2 pr-3", sim ? "font-bold" : "")}>
                      <span className={cn("mr-2 inline-block px-1.5 text-xs font-bold", sim ? "bg-tabled" : "bg-yes text-white")}>{sim ? "SIMULATED" : "REAL"}</span>
                      {r.status}
                    </td>
                    <td className="py-2">{r.how}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </dialog>
    </>
  );
}
