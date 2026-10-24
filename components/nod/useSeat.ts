"use client";

import { useEffect, useState } from "react";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { tables, type DbConnection } from "@/src/module_bindings";

/**
 * Sits this browser's identity in a human seat (approver or controller). The database, not the
 * page, decides what that seat may do.
 */
export function useSeat(actorId: string) {
  const { isActive, identity, getConnection } = useSpacetimeDB();
  const [seats] = useTable(tables.seat);
  const [error, setError] = useState<string | null>(null);
  const mine = identity ? seats.find((s) => s.identity.toHexString() === identity.toHexString()) : undefined;

  useEffect(() => {
    if (!isActive || !identity || mine?.actorId === actorId) return;
    const conn = getConnection() as DbConnection | null;
    conn?.reducers.takeSeat({ actorId }).catch((e: Error) => setError(e.message));
  }, [isActive, identity, mine?.actorId, actorId, getConnection]);

  return { seated: mine?.actorId === actorId, error, conn: getConnection() as DbConnection | null, isActive };
}
