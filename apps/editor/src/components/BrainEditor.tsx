import type { BrainEditorConfig } from "@wendoo/ui";
import { BrainEditorDialog, BrainEditorProvider } from "@wendoo/ui";
import { useMemo, useState } from "react";
import type { BrainEditing } from "@/brain/editing";
import { openBrainEditing } from "@/brain/editing";
import { buildBrainEditorConfig } from "@/brain/editor-config";
import { useBrains, useBrainsState } from "@/contexts/brains";

interface BrainEditorSessionProps {
  /** The dialog's config. */
  config: BrainEditorConfig;
  /** The editing the dialog stands over: its document, and where its edits go. */
  editing: BrainEditing;
  /** True while the dialog stands open. */
  isOpen: boolean;
  /** Called as the dialog opens or closes itself; on a close, after the editing has flushed. */
  onOpenChange: (open: boolean) => void;
}

/**
 * The brain editor dialog as a continuous session over `editing`: it opens
 * on `editing.srcBrainDef`, hands every edit to `editing.change` as it is
 * made, and flushes the editing as it closes, before reporting the close.
 */
export function BrainEditorSession({ config, editing, isOpen, onOpenChange }: BrainEditorSessionProps) {
  return (
    <BrainEditorProvider config={config}>
      <BrainEditorDialog
        continuous
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) editing.close();
          onOpenChange(open);
        }}
        srcBrainDef={editing.srcBrainDef}
        onChange={editing.change}
      />
    </BrainEditorProvider>
  );
}

interface BrainEditorProps {
  /** Document id of the brain to edit. */
  brainId: string;
  /** Called once the dialog has closed. */
  onClose: () => void;
}

/**
 * Edits one stored brain in the brain editor dialog: opens on the brain's
 * document as the store holds it when the editor mounts, and applies each
 * edit to the store, which compiles it, as a {@link BrainEditorSession}. The
 * dialog's config follows the store's environment and asset literals, rebuilt
 * each time either changes. Mount it keyed by `brainId` to edit another brain.
 */
export function BrainEditor({ brainId, onClose }: BrainEditorProps) {
  const store = useBrains();
  const { environment, assetLiterals, brainLiterals } = useBrainsState();
  const config = useMemo(
    () => buildBrainEditorConfig(environment, assetLiterals, brainLiterals),
    [environment, assetLiterals, brainLiterals]
  );
  const [editing] = useState(() => openBrainEditing(store, brainId));
  const [isOpen, setIsOpen] = useState(true);

  return (
    <BrainEditorSession
      config={config}
      editing={editing}
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          onClose();
        }
      }}
    />
  );
}
