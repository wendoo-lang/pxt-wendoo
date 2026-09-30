import { BrainEditorDialog, BrainEditorProvider } from "@wendoo/ui";
import { useMemo, useState } from "react";
import { openBrainEditing } from "@/brain/editing";
import { buildBrainEditorConfig } from "@/brain/editor-config";
import { useBrains, useBrainsState } from "@/contexts/brains";

interface BrainEditorProps {
  /** Document id of the brain to edit. */
  brainId: string;
  /** Called once the dialog has closed, whether it saved or was dismissed. */
  onClose: () => void;
}

/**
 * Edits one stored brain in the brain editor dialog: opens on the brain's
 * document as the store holds it when the editor mounts, and applies the
 * saved result to the store, which compiles it. The dialog's config follows
 * the store's environment, rebuilt each time the environment is. Mount it
 * keyed by `brainId` to edit another brain.
 */
export function BrainEditor({ brainId, onClose }: BrainEditorProps) {
  const store = useBrains();
  const { environment } = useBrainsState();
  const config = useMemo(() => buildBrainEditorConfig(environment), [environment]);
  const [editing] = useState(() => openBrainEditing(store, brainId));
  const [isOpen, setIsOpen] = useState(true);

  return (
    <BrainEditorProvider config={config}>
      <BrainEditorDialog
        isOpen={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) {
            onClose();
          }
        }}
        srcBrainDef={editing.srcBrainDef}
        onSubmit={(definition) => {
          editing.submit(definition);
          onClose();
        }}
      />
    </BrainEditorProvider>
  );
}
