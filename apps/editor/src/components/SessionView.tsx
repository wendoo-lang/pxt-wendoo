import { BridgeSessionErrorCode } from "@wendoo/bridge-app";
import { useBrainsState } from "@/contexts/brains";
import { useEditorSession, useEditorSessionState } from "@/contexts/editor-session";
import { AppHeader } from "./AppHeader";
import { BrainList } from "./BrainList";
import { CatalogDiagnosticsNotice } from "./CatalogDiagnosticsNotice";
import { CatalogPanel } from "./CatalogPanel";
import { VersionNotice } from "./VersionNotice";

/**
 * The session: the app header, the recovery affordances, the brain list,
 * the catalog's diagnostics, and the catalog panel. The replacement hold and
 * a version rejection render their notices at once, as does the
 * not-recognized notice for an entered code refused while the store falls
 * back to the held session.
 */
export function SessionView() {
  const store = useEditorSession();
  const { errorCode, catalogText } = useEditorSessionState();
  const { catalogDiagnostics } = useBrainsState();

  const replaced = errorCode === BridgeSessionErrorCode.SESSION_REPLACED;

  return (
    <div className="flex h-screen flex-col">
      <AppHeader />
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
        <BrainList />
        <CatalogDiagnosticsNotice diagnostics={catalogDiagnostics} />
        <CatalogPanel catalogText={catalogText} />
      </main>
    </div>
  );
}
