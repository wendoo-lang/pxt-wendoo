import { useState } from "react";
import { useEditorSession } from "@/contexts/editor-session";
import type { EditorSessionStore } from "@/services/editor-session-store";
import { ConfirmDialog } from "./ConfirmDialog";

interface EndSessionActionProps {
  /** Whether the confirmation is open. */
  confirming: boolean;
  /** Opens (`true`) or closes (`false`) the confirmation. */
  onConfirmingChange: (confirming: boolean) => void;
  /** The session store whose session a confirmed end ends. */
  session: Pick<EditorSessionStore, "forget">;
}

/**
 * The End session button and, while `confirming`, the destructive
 * confirmation it opens. The button only opens the confirmation; confirming
 * calls `session.forget()`, and cancelling closes the confirmation.
 */
export function EndSessionAction({ confirming, onConfirmingChange, session }: EndSessionActionProps) {
  return (
    <>
      <button
        type="button"
        data-testid="end-session-button"
        className="rounded-md border border-destructive/30 bg-background px-2.5 py-1 font-medium text-destructive text-xs hover:bg-destructive/10"
        onClick={() => onConfirmingChange(true)}
      >
        End session
      </button>
      {confirming && (
        <ConfirmDialog
          title="End session"
          message="End this session and disconnect the MakeCode project?"
          confirmLabel="End session"
          destructive
          onConfirm={() => session.forget()}
          onClose={() => onConfirmingChange(false)}
        />
      )}
    </>
  );
}

/** The header's End session action, over the editor's session store. */
export function EndSession() {
  const store = useEditorSession();
  const [confirming, setConfirming] = useState(false);
  return <EndSessionAction confirming={confirming} onConfirmingChange={setConfirming} session={store} />;
}
