import { useState } from "react";
import { useEditorSession, useEditorSessionState } from "@/contexts/editor-session";
import { VersionNotice } from "./VersionNotice";

/**
 * The join-code entry: how a person connects the editor to a MakeCode
 * project. Submitting the entered code opens a session presenting it; the
 * page also shows the version notice when a connect attempt was rejected for
 * a version mismatch.
 */
export function ConnectPage() {
  const store = useEditorSession();
  const { errorCode } = useEditorSessionState();
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
          if (trimmed !== "") store.connect(trimmed);
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
      <VersionNotice errorCode={errorCode} />
    </main>
  );
}
