import { BridgeSessionErrorCode } from "@wendoo/bridge-app";
import { X } from "lucide-react";
import { useId, useState } from "react";
import { useEditorSession, useEditorSessionState } from "@/contexts/editor-session";
import { useRecentBindings, useRecentBindingsList } from "@/contexts/recent-bindings";
import { resolveTarget } from "@/services/target-theme";
import { connectionStatus, StatusDot } from "./ConnectionStatus";
import { VersionNotice } from "./VersionNotice";

/**
 * The join-code entry: how a person connects the editor to a MakeCode
 * project. Submitting the entered code opens a session presenting it and
 * clears the entry. While the code is pending the page shows its progress
 * beside its status dot -- connecting, then waiting for the MakeCode project
 * once the code is accepted -- and it shows a notice, carrying the stable
 * code, when the code was not recognized, when the latest session was ended,
 * or when a connect attempt was rejected for a version mismatch. Below the
 * entry, the recent projects no other tab holds are listed while there are
 * any.
 */
export function ConnectPage() {
  const store = useEditorSession();
  const state = useEditorSessionState();
  const { entry, errorCode } = state;
  const status = connectionStatus(state);
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
          className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm"
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
          className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Connect
        </button>
      </form>
      {status !== undefined && (
        <output
          data-testid="connect-status"
          data-state={entry}
          data-status={status}
          className="flex items-center gap-2 text-muted-foreground text-sm"
        >
          <StatusDot status={status} />
          {entry === "submitted" ? "Connecting..." : "Code accepted. Waiting for the MakeCode project to connect..."}
        </output>
      )}
      {errorCode === BridgeSessionErrorCode.JOIN_CODE_UNKNOWN && (
        <section
          data-testid="code-unknown-notice"
          data-code={errorCode}
          className="max-w-md rounded-lg border border-border p-3 text-sm"
        >
          <p>That join code was not recognized. Enter the code your MakeCode project shows now.</p>
        </section>
      )}
      {errorCode === BridgeSessionErrorCode.SESSION_ENDED && (
        <section
          data-testid="ended-notice"
          data-code={errorCode}
          className="max-w-md rounded-lg border border-border p-3 text-sm"
        >
          <p>The session with the MakeCode project was ended. Enter the join code it shows to connect again.</p>
        </section>
      )}
      <VersionNotice errorCode={errorCode} />
      <RecentProjects />
    </main>
  );
}

/**
 * The recent projects no other tab holds, most recently seen first, one row
 * each carrying its entry id as `data-binding-id` and its target id as
 * `data-target`: the row's project opens its session, and its remove control
 * removes the entry. Renders nothing while there are none.
 */
function RecentProjects() {
  const recent = useRecentBindings();
  const bindings = useRecentBindingsList();
  const headingId = useId();
  if (bindings.length === 0) return null;

  return (
    <section data-testid="recent-projects" aria-labelledby={headingId} className="w-full max-w-xs">
      <h2 id={headingId} className="text-muted-foreground text-sm">
        Recent projects
      </h2>
      <ul className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border">
        {bindings.map((binding) => {
          const name = binding.projectName ?? "Unnamed project";
          const target = resolveTarget(binding.target);
          return (
            <li
              key={binding.id}
              data-testid="recent-project"
              data-binding-id={binding.id}
              data-target={binding.target}
              className="flex items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/50"
            >
              <button
                type="button"
                data-testid="recent-project-open"
                className="flex min-w-0 flex-1 items-baseline gap-2 text-left text-sm hover:underline"
                onClick={() => {
                  void recent.open(binding.id);
                }}
              >
                <span className="min-w-0 wrap-break-word">{name}</span>
                {target !== undefined && (
                  <span className="shrink-0 text-muted-foreground text-xs">{target.displayName}</span>
                )}
              </button>
              <button
                type="button"
                data-testid="recent-project-remove"
                aria-label={`Remove ${name}`}
                className="inline-flex shrink-0 items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  void recent.remove(binding.id);
                }}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
