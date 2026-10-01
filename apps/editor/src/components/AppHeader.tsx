import { useBrainsState } from "@/contexts/brains";
import { useEditorSessionState } from "@/contexts/editor-session";
import { resolveTarget } from "@/services/target-theme";
import { ConnectionStatus, connectionStatus } from "./ConnectionStatus";
import { EndSession } from "./EndSession";
import { SaveStatus } from "./SaveStatus";
import { WendooLogotype } from "./WendooLogo";

/**
 * The app header of the session view: the identity strip -- the Wendoo
 * logotype, linking to the Wendoo homepage in a new tab, and, when the
 * MakeCode side declared a target, its display name,
 * carrying the target id as `data-target` -- and the brains' save status
 * and the connection status, followed by the End session action while the
 * status is `connected` or `reconnecting`.
 */
export function AppHeader() {
  const state = useEditorSessionState();
  const brains = useBrainsState();
  const target = resolveTarget(state.target);
  const status = connectionStatus(state);

  return (
    <header
      data-testid="app-header"
      className="flex shrink-0 items-center justify-between gap-4 border-border border-b px-4 py-3"
    >
      <h1 className="flex items-baseline gap-2 font-bold text-base">
        <a href="https://wendoo.com" target="_blank" rel="noopener noreferrer" aria-label="Wendoo homepage">
          <WendooLogotype className="h-5 w-auto translate-y-[10.5%]" />
        </a>
        {target !== undefined && (
          <>
            <span aria-hidden="true" className="text-muted-foreground">
              /
            </span>
            <span data-testid="target-name" data-target={target.id}>
              {target.displayName}
            </span>
          </>
        )}
      </h1>
      <div className="flex items-center gap-3">
        <SaveStatus facts={brains} />
        {status !== undefined && <ConnectionStatus status={status} />}
        {(status === "connected" || status === "reconnecting") && <EndSession />}
      </div>
    </header>
  );
}
