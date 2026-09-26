import { createContext, useContext, useSyncExternalStore } from "react";
import type { EditorSessionStore, EditorSessionViewState } from "@/services/editor-session-store";

const EditorSessionContext = createContext<EditorSessionStore | null>(null);

export const EditorSessionProvider = EditorSessionContext.Provider;

/** Reads the editor session store from context. Throws when used outside the provider. */
export function useEditorSession(): EditorSessionStore {
  const store = useContext(EditorSessionContext);
  if (!store) {
    throw new Error("useEditorSession must be used within an EditorSessionProvider");
  }
  return store;
}

/** Subscribes to the store's view state and re-renders on change. */
export function useEditorSessionState(): EditorSessionViewState {
  const store = useEditorSession();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
