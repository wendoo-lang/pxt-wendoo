import { createContext, useContext, useSyncExternalStore } from "react";
import type { MakeCodeSession, MakeCodeSessionStatus } from "@/services/makecode-session";

const MakeCodeSessionContext = createContext<MakeCodeSession | null>(null);

export const MakeCodeSessionProvider = MakeCodeSessionContext.Provider;

/** Reads the MakeCode session from context. Throws when used outside the provider. */
export function useMakeCodeSession(): MakeCodeSession {
  const session = useContext(MakeCodeSessionContext);
  if (!session) {
    throw new Error("useMakeCodeSession must be used within an MakeCodeSessionProvider");
  }
  return session;
}

/** Subscribes to the session's lifecycle state and re-renders on change. */
export function useMakeCodeSessionStatus(): MakeCodeSessionStatus {
  const session = useMakeCodeSession();
  return useSyncExternalStore(
    (onChange) => session.subscribe(onChange),
    () => session.status
  );
}
