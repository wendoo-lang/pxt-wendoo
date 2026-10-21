import { createContext, useContext } from "react";
import type { EditorRequests } from "@/services/editor-requests";

const EditorRequestsContext = createContext<EditorRequests | null>(null);

/** Provides the editor's requests to {@link useEditorRequests} below it. */
export const EditorRequestsProvider = EditorRequestsContext.Provider;

/** Reads the editor's requests from context. Throws when used outside the provider. */
export function useEditorRequests(): EditorRequests {
  const requests = useContext(EditorRequestsContext);
  if (!requests) {
    throw new Error("useEditorRequests must be used within an EditorRequestsProvider");
  }
  return requests;
}
