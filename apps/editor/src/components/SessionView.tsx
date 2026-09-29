import { BridgeSessionErrorCode } from "@wendoo/bridge-app";
import { useEditorSession, useEditorSessionState } from "@/contexts/editor-session";
import { AppHeader } from "./AppHeader";
import { CatalogPanel } from "./CatalogPanel";
import { isVersionCode, VersionNotice } from "./VersionNotice";

/**
 * The session: the app header, the catalog panel, and the recovery
 * affordances. The disconnected indicator renders only once the
 * disconnection has outlasted the grace; the replacement hold and a version
 * rejection render their notices at once, as does the not-recognized notice
 * for an entered code refused while the store falls back to the held
 * session.
 */
export function SessionView() {
  const store = useEditorSession();
  const { errorCode, disconnectedBeyondGrace, catalogText } = useEditorSessionState();

  const replaced = errorCode === BridgeSessionErrorCode.SESSION_REPLACED;
  const showIndicator = disconnectedBeyondGrace && !replaced && !isVersionCode(errorCode);

  return (
    <div className="flex h-screen flex-col">
      <AppHeader />
      <main className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto p-6">
        {replaced && (
          <section
            data-testid="replaced-notice"
            data-code={errorCode}
            className="max-w-md rounded-lg border p-3 text-sm"
          >
            <p>Another editor took this session over. You can take it back, or start over with a new join code.</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                data-testid="reconnect-button"
                className="rounded-md border px-3 py-1.5 text-sm"
                onClick={() => {
                  store.reconnect();
                }}
              >
                Reconnect
              </button>
              <button
                type="button"
                data-testid="start-over-button"
                className="rounded-md border px-3 py-1.5 text-sm"
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
            className="max-w-md rounded-lg border p-3 text-sm"
          >
            <p>That join code was not recognized. Reconnecting to the MakeCode project you were connected to.</p>
          </section>
        )}
        <VersionNotice errorCode={errorCode} />
        {showIndicator && (
          <section data-testid="disconnected-indicator" className="max-w-md rounded-lg border p-3 text-sm">
            <p className="font-medium">The MakeCode project isn't connected right now</p>
            <p className="text-muted-foreground">Waiting for it to come back...</p>
            <button
              type="button"
              data-testid="forget-button"
              className="mt-2 rounded-md border px-3 py-1.5 text-sm"
              onClick={() => {
                store.forget();
              }}
            >
              Start over
            </button>
          </section>
        )}
        <CatalogPanel catalogText={catalogText} />
      </main>
    </div>
  );
}
