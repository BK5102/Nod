"use client";

// The live source: subscribes to the public tables on SpacetimeDB, sits this browser in the
// traveler seat, calls approve_offer itself, and asks the server routes for the demo controls and
// the agent's attempt. Same shape as the mock, so the components never know which one runs.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SpacetimeDBProvider, useSpacetimeDB, useTable } from "spacetimedb/react";
import { DbConnection, tables } from "@/src/module_bindings";
import type { ActionResult, AgentStep, Offer, Receipt, RerouteSource, Trip } from "./types";

export const STDB_HOST = process.env.NEXT_PUBLIC_SPACETIMEDB_HOST ?? "wss://maincloud.spacetimedb.com";
export const STDB_DB = process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME ?? "";
// The module seeds the traveler actor as "act_traveler" (PLAN.md section 9 says "traveler").
const TRAVELER = "act_traveler";
const TOKEN_KEY = `rerouted:${STDB_HOST}/${STDB_DB}/traveler`;

function readToken(): string | undefined {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
function saveToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Private mode: the identity lasts for this tab only.
  }
}

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const builder = useMemo(
    () =>
      DbConnection.builder()
        .withUri(STDB_HOST)
        .withDatabaseName(STDB_DB)
        .withToken(typeof window !== "undefined" ? readToken() : undefined)
        .withAutomaticReconnect()
        .onConnect((_c, _id, token) => saveToken(token)),
    [],
  );
  return <SpacetimeDBProvider connectionBuilder={builder}>{children}</SpacetimeDBProvider>;
}

const message = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/^.*?Refused:/, "Refused:");
};

async function post(url: string, payload: object): Promise<ActionResult & { result?: { refused?: boolean; reason?: string } }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const json = (await res.json()) as { ok: boolean; error?: string; result?: { refused?: boolean; reason?: string } };
    return json.ok ? { ok: true, result: json.result } : { ok: false, error: json.error ?? `Request failed (${res.status})` };
  } catch (e) {
    return { ok: false, error: `Could not reach the server: ${message(e)}` };
  }
}

export function useLive(): RerouteSource {
  const { isActive, identity, getConnection } = useSpacetimeDB();
  const [trips] = useTable(tables.trip);
  const [mandates] = useTable(tables.mandate);
  const [offerRows] = useTable(tables.offer);
  const [stepRows] = useTable(tables.agentStep);
  const [receiptRows] = useTable(tables.receipt);
  const [seats] = useTable(tables.seat);
  const [seatError, setSeatError] = useState<string | null>(null);
  const asked = useRef(false);

  const conn = getConnection() as DbConnection | null;
  const seated = !!identity && seats.some((s) => s.identity.toHexString() === identity.toHexString() && s.actorId === TRAVELER);

  useEffect(() => {
    if (!isActive || !identity || seated || asked.current || !conn) return;
    asked.current = true;
    conn.reducers.takeSeat({ actorId: TRAVELER }).catch((e: unknown) => setSeatError(message(e)));
  }, [isActive, identity, seated, conn]);

  const trip = (trips[0] as Trip | undefined) ?? null;
  const state = useMemo(
    () => ({
      trip,
      mandate: mandates[0] ?? null,
      offers: offerRows.map((o) => o as Offer),
      steps: stepRows
        .map((s) => ({ ...s, id: Number(s.id) }) as AgentStep)
        .sort((a, b) => a.seq - b.seq),
      receipts: receiptRows.map((r) => r as Receipt).sort((a, b) => a.seq - b.seq),
    }),
    [trip, mandates, offerRows, stepRows, receiptRows],
  );

  const approve = useCallback(
    async (offerId: string, quoteHash: string): Promise<ActionResult> => {
      const c = getConnection() as DbConnection | null;
      if (!c) return { ok: false, error: "Not connected to the database yet." };
      try {
        await c.reducers.approveOffer({ offerId, quoteHash });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: message(e) };
      }
    },
    [getConnection],
  );

  const actions = useMemo(
    () => ({
      reset: () => post("/api/demo", { action: "reset" }),
      cancel: () => post("/api/demo", { action: "cancel" }),
      setPrice: (offerId: string, priceCents: number) => post("/api/demo", { action: "price", offerId, priceCents }),
      async agentTryApprove(offerId: string): Promise<ActionResult> {
        const r = await post("/api/agent/try-approve", { offerId });
        if (!r.ok) return r;
        return r.result?.refused ? { ok: false, error: r.result.reason ?? "Refused." } : { ok: true };
      },
      approve,
    }),
    [approve],
  );

  return { state, actions, mode: "live", connected: isActive && seated, seatError };
}
