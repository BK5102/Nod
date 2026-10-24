"use client";

import { useSyncExternalStore } from "react";
import { createMockEngine } from "./mock";
import type { RerouteSource } from "./types";

// One mock engine per tab.
let engine: ReturnType<typeof createMockEngine> | null = null;
const getEngine = () => (engine ??= createMockEngine());

export function useMock(fallbackReason?: string): RerouteSource {
  const e = getEngine();
  const state = useSyncExternalStore(e.subscribe, e.getState, e.getState);
  return { state, actions: e.actions, mode: "mock", connected: true, fallbackReason };
}
