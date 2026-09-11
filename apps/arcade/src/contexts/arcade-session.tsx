import { createContext, useContext, useSyncExternalStore } from "react";
import type { ArcadeSession, ArcadeSessionStatus } from "@/services/arcade-session";

const ArcadeSessionContext = createContext<ArcadeSession | null>(null);

export const ArcadeSessionProvider = ArcadeSessionContext.Provider;

/** Reads the arcade session from context. Throws when used outside the provider. */
export function useArcadeSession(): ArcadeSession {
  const session = useContext(ArcadeSessionContext);
  if (!session) {
    throw new Error("useArcadeSession must be used within an ArcadeSessionProvider");
  }
  return session;
}

/** Subscribes to the session's lifecycle state and re-renders on change. */
export function useArcadeSessionStatus(): ArcadeSessionStatus {
  const session = useArcadeSession();
  return useSyncExternalStore(
    (onChange) => session.subscribe(onChange),
    () => session.status
  );
}
