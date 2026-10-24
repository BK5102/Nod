"use client";

import { MoneyRouteCanvas } from "@/components/nod/MoneyRouteCanvas";
import { NodMark } from "@/components/nod/TopBar";
import type { RouteRun } from "@/lib/three/route";

/**
 * The project image (1600 x 900), rendered from the app's own scene in its final state. Captured to
 * public/project-image.png with scripts/shot.ts. The run shown is the demo's changed-bank-details case.
 */
const RUN: RouteRun = {
  amountCents: 677_100,
  vendor: "Harbor Produce Co.",
  number: "HP-9950",
  asksLast4: "7731",
  onFileLast4: "4821",
  checks: [
    { id: "sender_domain", label: "Sender", fired: false, tier: "AUTO", reason: "" },
    { id: "new_vendor", label: "Vendor", fired: false, tier: "AUTO", reason: "" },
    { id: "duplicate", label: "Duplicate", fired: false, tier: "AUTO", reason: "" },
    { id: "po_match", label: "PO", fired: false, tier: "AUTO", reason: "" },
    { id: "contract_price", label: "Price", fired: false, tier: "AUTO", reason: "" },
    {
      id: "bank_change",
      label: "Bank account",
      fired: true,
      tier: "HOLD",
      reason: "Invoice asks for payment to account ending 7731; the account on file ends 4821.",
    },
  ],
};

export default function Cover() {
  return (
    <main className="grid h-[900px] w-[1600px] grid-cols-[560px_1fr] overflow-hidden bg-paper">
      <section className="flex flex-col justify-between bg-ink p-14 text-paper">
        <div className="flex items-center gap-3">
          <NodMark className="h-12 w-12" />
          <span className="text-4xl font-bold">Nod</span>
        </div>
        <div>
          <h1 className="text-5xl leading-tight font-bold">A robot bookkeeper that won&apos;t send your money to a scammer&apos;s new bank account.</h1>
          <p className="mt-6 text-xl text-paper/80">
            It stops and asks a person before paying a new account, makes sure that yes can be trusted, and keeps a receipt for every decision.
          </p>
        </div>
        <p className="text-base text-paper/70">Prototype. Fictional organization, SIMULATED approval signal, mock bank.</p>
      </section>
      <section className="relative">
        <MoneyRouteCanvas run={RUN} instant className="block h-[900px] w-full" />
      </section>
    </main>
  );
}
