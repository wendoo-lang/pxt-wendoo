import { ConnectPage } from "@/components/ConnectPage";
import { SessionView } from "@/components/SessionView";
import { useEditorSessionState } from "@/contexts/editor-session";

/**
 * Root view: the join-code entry while no session exists, and the session --
 * status, join code, catalog -- once one does.
 */
export function App() {
  const { view } = useEditorSessionState();
  return view === "connect" ? <ConnectPage /> : <SessionView />;
}
