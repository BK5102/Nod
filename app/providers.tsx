"use client";

import { useMemo } from "react";
import { SpacetimeDBProvider } from "spacetimedb/react";
import { DbConnection } from "@/src/module_bindings";

export const STDB_HOST = process.env.NEXT_PUBLIC_SPACETIMEDB_HOST ?? "wss://maincloud.spacetimedb.com";
export const STDB_DB = process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME ?? "";

/** Each browser keeps its own identity per role, so the approver and the controller are different callers. */
export function tokenKey(role: string) {
  return `nod:${STDB_HOST}/${STDB_DB}/${role}`;
}

export function readToken(role: string): string | undefined {
  try {
    return localStorage.getItem(tokenKey(role)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveToken(role: string, token: string) {
  try {
    localStorage.setItem(tokenKey(role), token);
  } catch {
    // Private mode: the identity lasts for this tab only.
  }
}

export function Providers({ children, role = "viewer" }: { children: React.ReactNode; role?: string }) {
  const builder = useMemo(
    () =>
      DbConnection.builder()
        .withUri(STDB_HOST)
        .withDatabaseName(STDB_DB)
        .withToken(typeof window !== "undefined" ? readToken(role) : undefined)
        .withAutomaticReconnect()
        .onConnect((_c, _id, token) => saveToken(role, token)),
    [role],
  );
  return <SpacetimeDBProvider connectionBuilder={builder}>{children}</SpacetimeDBProvider>;
}
