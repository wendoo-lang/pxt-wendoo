import { useEditorSessionState } from "@/contexts/editor-session";
import { resolveTarget } from "@/services/target-theme";
import { ConnectionStatus, connectionStatus } from "./ConnectionStatus";
import { WendooLogotype } from "./WendooLogo";

/**
 * The app header of the session view: the identity strip -- the Wendoo
 * logotype and, when the MakeCode side declared a target, its display name,
 * carrying the target id as `data-target` -- and the connection status.
 */
export function AppHeader() {
  const state = useEditorSessionState();
  const target = resolveTarget(state.target);
  const status = connectionStatus(state);

  return (
    <header
      data-testid="app-header"
      className="flex shrink-0 items-center justify-between gap-4 border-border border-b px-4 py-3"
    >
      <h1 className="flex items-baseline gap-2 font-bold text-base">
        <span className="sr-only">Wendoo</span>
        <WendooLogotype className="h-5 w-auto translate-y-[10.5%]" />
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
      {status !== undefined && <ConnectionStatus status={status} />}
    </header>
  );
}
