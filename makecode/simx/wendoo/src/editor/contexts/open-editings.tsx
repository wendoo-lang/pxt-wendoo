import { createContext, useContext, useEffect } from "react";
import type { BrainEditing, OpenEditings } from "@/brain/editing";

const OpenEditingsContext = createContext<OpenEditings | null>(null);

/** Provides the page's open editings to {@link useTrackedEditing} below it. */
export const OpenEditingsProvider = OpenEditingsContext.Provider;

/**
 * Tracks `editing` in the open editings provided above the calling
 * component, while it is mounted. Tracks nothing when none are provided.
 */
export function useTrackedEditing(editing: BrainEditing): void {
  const editings = useContext(OpenEditingsContext);
  useEffect(() => editings?.track(editing), [editings, editing]);
}
