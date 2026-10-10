import { BridgeSessionErrorCode } from "@wendoo/bridge-app";
import { useDocsSidebar } from "@wendoo/docs";
import { useBrainsState } from "@/contexts/brains";
import { useEditorSession, useEditorSessionState } from "@/contexts/editor-session";
import type { TileKindColors } from "@/services/target-theme";
import { BrainList } from "./BrainList";
import { CatalogDiagnosticsNotice } from "./CatalogDiagnosticsNotice";
import { connectionStatus } from "./ConnectionStatus";
import { DocsButton } from "./DocsButton";
import { saveState } from "./SaveStatus";
import { VersionNotice } from "./VersionNotice";

/**
 * The session: the Docs toggle in the page's upper right corner, then the
 * recovery affordances, the brain list, and the catalog's diagnostics. The
 * replacement hold and a version rejection render their notices at once, as
 * does the not-recognized notice for an entered code refused while the store
 * falls back to the held session. The connection status and the save state
 * are shown nowhere: the root element carries them as data -- the
 * {@link connectionStatus} as `data-status`, the {@link saveState} as
 * `data-save-state`, the brains store's pend count as `data-pending`, its
 * pushes in flight as `data-in-flight`, and its reconciled flag as
 * `data-reconciled`. Mount it under a `DocsSidebarProvider`; the Docs toggle
 * opens and closes that provider's sidebar. The brain editor fills tiles in
 * `tileColors` where they are given.
 */
export function SessionView({ tileColors }: { tileColors?: TileKindColors }) {
  const store = useEditorSession();
  const state = useEditorSessionState();
  const { catalogDiagnostics, pending, pushesInFlight, reconciled } = useBrainsState();
  const { toggle: toggleDocs, isOpen: isDocsOpen } = useDocsSidebar();
  const { errorCode } = state;

  const replaced = errorCode === BridgeSessionErrorCode.SESSION_REPLACED;

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
        {replaced && (
          <section
            data-testid="replaced-notice"
            data-code={errorCode}
            className="max-w-md rounded-lg border border-border p-3 text-sm"
          >
            <p>Another editor took this session over. You can take it back, or start over with a new join code.</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                data-testid="reconnect-button"
                className="rounded-md border border-border px-3 py-1.5 text-sm"
                onClick={() => {
                  store.reconnect();
                }}
              >
                Reconnect
              </button>
              <button
                type="button"
                data-testid="start-over-button"
                className="rounded-md border border-border px-3 py-1.5 text-sm"
                onClick={() => {
                  store.forget();
                }}
              >
                Start over
              </button>
            </div>
          </section>
        )}
        {errorCode === BridgeSessionErrorCode.JOIN_CODE_UNKNOWN && (
          <section
            data-testid="code-unknown-notice"
            data-code={errorCode}
            className="max-w-md rounded-lg border border-border p-3 text-sm"
          >
            <p>That join code was not recognized. Reconnecting to the MakeCode project you were connected to.</p>
          </section>
        )}
        <VersionNotice errorCode={errorCode} />
        <BrainList tileColors={tileColors} />
        <CatalogDiagnosticsNotice diagnostics={catalogDiagnostics} />
      </main>
    </div>
  );
}
