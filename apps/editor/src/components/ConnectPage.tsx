import { BridgeSessionErrorCode } from "@wendoo/bridge-app";
import { useState } from "react";
import { useEditorSession, useEditorSessionState } from "@/contexts/editor-session";
import { VersionNotice } from "./VersionNotice";

/**
 * The join-code entry: how a person connects the editor to a MakeCode
 * project. Submitting the entered code opens a session presenting it and
 * clears the entry. While the code is pending the page shows its progress --
 * connecting, then waiting for the game once the code is accepted -- and it
 * shows a notice, carrying the stable code, when the code was not recognized,
 * when the latest session was ended, or when a connect attempt was rejected
 * for a version mismatch.
 */
export function ConnectPage() {
  const store = useEditorSession();
  const { entry, errorCode } = useEditorSessionState();
  const [code, setCode] = useState("");
  const trimmed = code.trim();

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-xl font-semibold">Wendoo</h1>
      <p className="text-muted-foreground text-sm">Enter the join code your MakeCode project shows.</p>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed === "") return;
          store.connect(trimmed);
          setCode("");
        }}
      >
        <input
          data-testid="join-code-input"
          className="rounded-md border bg-background px-3 py-1.5 font-mono text-sm"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-label="Join code"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          data-testid="connect-button"
          disabled={trimmed === ""}
          className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Connect
        </button>
      </form>
      {entry !== undefined && (
        <output data-testid="connect-status" data-state={entry} className="block text-muted-foreground text-sm">
          {entry === "submitted" ? "Connecting..." : "Code accepted. Waiting for the game to connect..."}
        </output>
      )}
      {errorCode === BridgeSessionErrorCode.JOIN_CODE_UNKNOWN && (
        <section
          data-testid="code-unknown-notice"
          data-code={errorCode}
          className="max-w-md rounded-lg border p-3 text-sm"
        >
          <p>That join code was not recognized. Enter the code your MakeCode project shows now.</p>
        </section>
      )}
      {errorCode === BridgeSessionErrorCode.SESSION_ENDED && (
        <section data-testid="ended-notice" data-code={errorCode} className="max-w-md rounded-lg border p-3 text-sm">
          <p>The session with the MakeCode project was ended. Enter the join code it shows to connect again.</p>
        </section>
      )}
      <VersionNotice errorCode={errorCode} />
    </main>
  );
}
