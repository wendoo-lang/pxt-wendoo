import { Toaster } from "@wendoo/ui";
import { ConnectPage } from "@/components/ConnectPage";
import { SessionView } from "@/components/SessionView";
import { useEditorSessionState } from "@/contexts/editor-session";

/**
 * Root view: the join-code entry while no session exists, and the session --
 * status, brains, catalog -- once one does; and the toast region the shared
 * components announce through.
 */
export function App() {
  const { view } = useEditorSessionState();
  return (
    <>
      {view === "connect" ? <ConnectPage /> : <SessionView />}
      <Toaster />
    </>
  );
}
