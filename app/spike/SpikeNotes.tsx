"use client";

import { useState } from "react";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { tables } from "@/src/module_bindings";
import { Button } from "@/components/ui/button";

export function SpikeNotes() {
  const { isActive } = useSpacetimeDB();
  const [notes, ready] = useTable(tables.note);
  const [status, setStatus] = useState<string | null>(null);

  async function addFromServer() {
    setStatus("Calling the server route...");
    const res = await fetch("/api/spike", { method: "POST" });
    const body = (await res.json()) as { ok: boolean; error?: string };
    setStatus(body.ok ? "The server wrote a note. It should appear below without a reload." : `Server route failed: ${body.error}`);
  }

  const sorted = [...notes].sort((a, b) => Number(b.id - a.id));
  return (
    <section className="mt-8">
      <p className="text-sm text-ink-soft">
        {isActive ? "Connected to SpacetimeDB" : "Connecting to SpacetimeDB..."} {ready ? "· live" : ""}
      </p>
      <Button className="mt-4" onClick={addFromServer} disabled={!isActive}>
        Write a note from the server
      </Button>
      {status && <p className="mt-3 text-sm">{status}</p>}
      <ul className="mt-6 divide-y divide-rule border-y border-rule">
        {sorted.length === 0 && <li className="py-3 text-ink-soft">No notes yet. Write one from the server.</li>}
        {sorted.map((n) => (
          <li key={String(n.id)} className="flex justify-between gap-4 py-3">
            <span>
              #{String(n.id)} {n.text}
            </span>
            <span className={n.approved ? "font-bold text-yes" : "text-ink-soft"}>{n.approved ? "approved" : "not approved"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
