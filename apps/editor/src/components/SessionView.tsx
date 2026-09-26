import { BridgeSessionErrorCode } from "@wendoo/bridge-app";
import { useState } from "react";
import { useEditorSession, useEditorSessionState } from "@/contexts/editor-session";
import { CatalogPanel } from "./CatalogPanel";
import { isVersionCode, VersionNotice } from "./VersionNotice";

/**
 * The session: the join code with a copy affordance, the catalog panel, and
 * the recovery affordances. The disconnected indicator renders only once the
 * disconnection has outlasted the grace; the replacement hold and a version
 * rejection render their notices at once.
 */
export function SessionView() {
  const store = useEditorSession();
  const { joinCode, errorCode, disconnectedBeyondGrace, catalogText } = useEditorSessionState();
  const [copied, setCopied] = useState(false);

  const replaced = errorCode === BridgeSessionErrorCode.SESSION_REPLACED;
  const showIndicator = disconnectedBeyondGrace && !replaced && !isVersionCode(errorCode);

  return (
    <main className="flex h-screen flex-col items-center gap-4 overflow-y-auto p-6">
      <header className="flex flex-col items-center gap-2">
        <h1 className="text-xl font-semibold">Wendoo</h1>
        {joinCode !== undefined && (
          <div className="flex items-center gap-1.5">
            <span data-testid="join-code" className="font-mono text-sm">
              {joinCode}
            </span>
            <button
              type="button"
              data-testid="copy-join-code"
              className="rounded border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              aria-label={copied ? "Copied to clipboard" : "Copy join code"}
              onClick={() => {
                void navigator.clipboard.writeText(joinCode);
                setCopied(true);
                setTimeout(() => {
                  setCopied(false);
                }, 1500);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
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
