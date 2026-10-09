import { createContext, useContext, useSyncExternalStore } from "react";
import type { RecentBinding } from "@/services/binding-entries";
import type { RecentBindings } from "@/services/recent-bindings";

const RecentBindingsContext = createContext<RecentBindings | null>(null);

/** Provides the recent projects to {@link useRecentBindings} below it. */
export const RecentBindingsProvider = RecentBindingsContext.Provider;

/** Reads the recent projects from context. Throws when used outside the provider. */
export function useRecentBindings(): RecentBindings {
  const recent = useContext(RecentBindingsContext);
  if (!recent) {
    throw new Error("useRecentBindings must be used within a RecentBindingsProvider");
  }
  return recent;
}

/** Subscribes to the listed recent projects and re-renders on change. */
export function useRecentBindingsList(): readonly RecentBinding[] {
  const recent = useRecentBindings();
  return useSyncExternalStore(recent.subscribe, recent.getSnapshot, recent.getSnapshot);
}
