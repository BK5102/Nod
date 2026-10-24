"use client";

import { useSyncExternalStore } from "react";
import { createMockEngine } from "./mock";
import type { RerouteSource } from "./types";

// One engine per tab. The live adapter (after backend milestone B1) will return the same shape.
let engine: ReturnType<typeof createMockEngine> | null = null;
const getEngine = () => (engine ??= createMockEngine());

export function useRerouted(): RerouteSource {
  const e = getEngine();
  const state = useSyncExternalStore(e.subscribe, e.getState, e.getState);
  return { state, actions: e.actions, mode: "mock", connected: true };
}
