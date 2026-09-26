import { BridgeSessionErrorCode } from "@wendoo/bridge-app";
import { useEditorSession, useEditorSessionState } from "@/contexts/editor-session";
import { CatalogPanel } from "./CatalogPanel";
import { isVersionCode, VersionNotice } from "./VersionNotice";

/**
 * The session: the catalog panel and the recovery affordances. The
 * disconnected indicator renders only once the disconnection has outlasted
 * the grace; the replacement hold and a version rejection render their
 * notices at once.
 */
export function SessionView() {
  const store = useEditorSession();
  const { errorCode, disconnectedBeyondGrace, catalogText } = useEditorSessionState();

  const replaced = errorCode === BridgeSessionErrorCode.SESSION_REPLACED;
  const showIndicator = disconnectedBeyondGrace && !replaced && !isVersionCode(errorCode);

  return (
    <main className="flex h-screen flex-col items-center gap-4 overflow-y-auto p-6">
      <header className="flex flex-col items-center gap-2">
        <h1 className="text-xl font-semibold">Wendoo</h1>
      </header>
      {replaced && (
        <section data-testid="replaced-notice" data-code={errorCode} className="max-w-md rounded-lg border p-3 text-sm">
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
      <VersionNotice errorCode={errorCode} />
      {showIndicator && (
        <section data-testid="disconnected-indicator" className="max-w-md rounded-lg border p-3 text-sm">
          <p>Not connected to the MakeCode project right now.</p>
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
  );
}
