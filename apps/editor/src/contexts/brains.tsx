import { createContext, useContext, useSyncExternalStore } from "react";
import type { BrainsStore, BrainsViewState } from "@/services/brains-store";

const BrainsContext = createContext<BrainsStore | null>(null);

/** Provides the brains store to {@link useBrains} and {@link useBrainsState} below it. */
export const BrainsProvider = BrainsContext.Provider;

/** Reads the brains store from context. Throws when used outside the provider. */
export function useBrains(): BrainsStore {
  const store = useContext(BrainsContext);
  if (!store) {
    throw new Error("useBrains must be used within a BrainsProvider");
  }
  return store;
}

/** Subscribes to the brains store's view state and re-renders on change. */
export function useBrainsState(): BrainsViewState {
  const store = useBrains();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
