"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTable } from "spacetimedb/react";
import { tables } from "@/src/module_bindings";
import { longDate } from "@/lib/ui/format";
import { cn } from "@/lib/utils";
import { ProofPanel } from "./ProofPanel";

const NAV = [
  { href: "/", label: "Four questions" },
  { href: "/intake", label: "Hand Nod an invoice" },
  { href: "/moment", label: "Baseline vs Nod" },
  { href: "/approve", label: "Approve" },
  { href: "/books", label: "Books" },
  { href: "/why-nod", label: "Why Nod" },
];

/** The mark: a single raised voting card, the product's one gesture. */
export function NodMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="7" y="2" width="10" height="14" fill="var(--card-yes)" />
      <rect x="11" y="15" width="2" height="7" fill="var(--ink)" />
    </svg>
  );
}

export function TopBar() {
  const path = usePathname();
  const [clock] = useTable(tables.simClock);
  const [queue] = useTable(tables.invoice.where((r) => r.status.eq("awaiting_approval")));
  const asOf = clock[0]?.asOf ?? "";
  return (
    <header className="border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 sm:px-8">
        <Link href="/" className="flex items-center gap-2" aria-label="Nod, home">
          <NodMark className="h-6 w-6" />
          <span className="text-lg font-bold">Nod</span>
        </Link>
        <span className="text-sm text-ink-soft">Eastbay Community Pantry</span>
        <nav aria-label="Main" className="flex gap-1">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn("rounded-md px-3 py-1.5 text-sm", active ? "bg-paper-raised font-bold" : "text-ink-soft hover:text-ink")}
              >
                {n.label}
                {n.href === "/approve" && queue.length > 0 && <span className="ml-1.5 tabular-nums">{queue.length}</span>}
              </Link>
            );
          })}
        </nav>
        <span className="ml-auto text-sm text-ink-soft" title="Simulated company clock">
          {asOf ? `Books as of ${longDate(asOf)}` : "Connecting..."}
        </span>
        <ProofPanel />
      </div>
    </header>
  );
}
