import { useDocsSidebar } from "@wendoo/docs";
import { useBrainsState } from "@/contexts/brains";
import { useEditorSessionState } from "@/contexts/editor-session";
import { connectionStatus } from "@/services/connection-status";
import { saveState } from "@/services/save-state";
import type { TileKindColors } from "@/services/target-theme";
import { BrainList } from "./BrainList";
import { CatalogDiagnosticsNotice } from "./CatalogDiagnosticsNotice";
import { DocsButton } from "./DocsButton";
import { VersionNotice } from "./VersionNotice";

/**
 * The session: the Docs toggle in the page's upper right corner, then the
 * version notice, the brain list, and the catalog's diagnostics. The root
 * element carries the session's state as data -- the
 * {@link connectionStatus} as `data-status`, the {@link saveState} as
 * `data-save-state`, the brains store's pend count as `data-pending`, its
 * pushes in flight as `data-in-flight`, and its reconciled flag as
 * `data-reconciled`. Mount it under a `DocsSidebarProvider`; the Docs toggle
 * opens and closes that provider's sidebar. The brain editor fills tiles in
 * `tileColors` where they are given.
 */
export function SessionView({ tileColors }: { tileColors?: TileKindColors }) {
  const state = useEditorSessionState();
  const { catalogDiagnostics, pending, pushesInFlight, reconciled } = useBrainsState();
  const { toggle: toggleDocs, isOpen: isDocsOpen } = useDocsSidebar();

  return (
    <div
      data-testid="session-view"
      data-status={connectionStatus(state)}
      data-save-state={saveState({ pending, pushesInFlight })}
      data-pending={pending.size}
      data-in-flight={pushesInFlight}
      data-reconciled={reconciled}
      className="flex h-screen flex-col"
    >
      <div data-testid="corner-controls" className="flex shrink-0 justify-end px-4 pt-3">
        <DocsButton isOpen={isDocsOpen} onToggle={toggleDocs} />
      </div>
      <main className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto p-6">
        <VersionNotice errorCode={state.errorCode} />
        <BrainList tileColors={tileColors} />
        <CatalogDiagnosticsNotice diagnostics={catalogDiagnostics} />
      </main>
    </div>
  );
}
