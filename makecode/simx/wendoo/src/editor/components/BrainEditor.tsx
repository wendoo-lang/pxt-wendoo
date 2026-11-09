import type { BrainDef } from "@wendoo/core/app";
import { useDocsSidebar } from "@wendoo/docs";
import type { BrainEditorConfig } from "@wendoo/ui";
import { BrainEditorDialog, BrainEditorProvider } from "@wendoo/ui";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { BrainEditing } from "@/brain/editing";
import { openBrainEditing } from "@/brain/editing";
import { buildBrainEditorConfig } from "@/brain/editor-config";
import { useBrains, useBrainsState } from "@/contexts/brains";
import { useTrackedEditing } from "@/contexts/open-editings";
import { createTileDocsAction } from "@/docs/docs-registry";
import type { TileKindColors } from "@/services/target-theme";

interface BrainEditorSessionProps {
  /** The dialog's config. */
  config: BrainEditorConfig;
  /** The editing the dialog stands over: where its edits go. */
  editing: BrainEditing;
  /** The document the dialog stands on: the editing's, as its subscription last delivered it. */
  srcBrainDef: BrainDef | undefined;
  /** True while the dialog stands open. */
  isOpen: boolean;
  /** Called as the dialog opens or closes itself; on a close, after the editing has flushed. */
  onOpenChange: (open: boolean) => void;
}

/**
 * The brain editor dialog as a continuous session over `editing`: it stands
 * on `srcBrainDef`, standing afresh on each new document it is given, hands
 * every edit to `editing.change` as it is made, and closes the editing as it
 * closes, before reporting the close.
 */
export function BrainEditorSession({ config, editing, srcBrainDef, isOpen, onOpenChange }: BrainEditorSessionProps) {
  return (
    <BrainEditorProvider config={config}>
      <BrainEditorDialog
        continuous
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) editing.close();
          onOpenChange(open);
        }}
        srcBrainDef={srcBrainDef}
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
  /** The declared target's tile fills, keyed by tile kind; omit them while it gives none. */
  tileColors?: TileKindColors;
}

/**
 * Edits one stored brain in the brain editor dialog: opens on the brain's
 * document as the store holds it when the editor mounts, stands afresh on
 * each newer version of the brain its editing adopts from the store, and
 * applies each edit to the store, which compiles it, as a
 * {@link BrainEditorSession}. The
 * dialog's config follows the store's environment, its asset, brain and pack
 * literals, its type icons and its page icon, and `tileColors`, rebuilt each
 * time any of them changes. Mount it keyed by `brainId` to edit another brain.
 * The dialog opens a tile's documentation -- a pack literal's opening its
 * type's page while the docs hold one, any other tile's its own -- and
 * toggles the docs sidebar, through the docs sidebar context; mount it under
 * a `DocsSidebarProvider`. Its editing is tracked in the open editings
 * provided above it, if any, while it is mounted. Unmounting it flushes its
 * editing's latest edit at once, as closing the dialog does.
 */
export function BrainEditor({ brainId, onClose, tileColors }: BrainEditorProps) {
  const store = useBrains();
  const { environment, assetLiterals, brainLiterals, packLiterals, typeIcons, typeLabels, pageIcon } = useBrainsState();
  const {
    registry: docsRegistry,
    openDocsForTile,
    open: openDocs,
    navigateToEntry,
    isOpen: isDocsOpen,
    toggle: toggleDocs,
    close: closeDocs,
    reportEditorMode,
  } = useDocsSidebar();
  const config = useMemo(
    (): BrainEditorConfig => ({
      ...buildBrainEditorConfig(
        environment,
        assetLiterals,
        brainLiterals,
        packLiterals,
        typeIcons,
        typeLabels,
        pageIcon,
        tileColors
      ),
      onTileDocs: createTileDocsAction(
        { registry: docsRegistry, openDocsForTile, open: openDocs, navigateToEntry },
        packLiterals
      ),
      docsIntegration: { isOpen: isDocsOpen, toggle: toggleDocs, close: closeDocs, reportMode: reportEditorMode },
    }),
    [
      environment,
      assetLiterals,
      brainLiterals,
      typeIcons,
      typeLabels,
      pageIcon,
      tileColors,
      docsRegistry,
      openDocsForTile,
      openDocs,
      navigateToEntry,
      packLiterals,
      isDocsOpen,
      toggleDocs,
      closeDocs,
      reportEditorMode,
    ]
  );
  const [editing] = useState(() => openBrainEditing(store, brainId));
  useTrackedEditing(editing);
  useEffect(() => () => editing.close(), [editing]);
  const srcBrainDef = useSyncExternalStore(editing.subscribe, editing.getDocument, editing.getDocument);
  const [isOpen, setIsOpen] = useState(true);

  return (
    <BrainEditorSession
      config={config}
      editing={editing}
      srcBrainDef={srcBrainDef}
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
