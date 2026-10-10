import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wendoo/ui";
import { CircleAlert, MoreHorizontal, Plus } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useBrains, useBrainsState } from "@/contexts/brains";
import type { AssetLiteral } from "@/services/asset-literals";
import { BRAIN_ASSET_UNRESOLVED } from "@/services/asset-literals";
import type { BrainDamageCode, BrainsStore } from "@/services/brains-store";
import type { TileKindColors } from "@/services/target-theme";
import {
  BrainDiagnosticsList,
  BrainErrorBadge,
  brainCompileState,
  listedDiagnostics,
  toggledBrainId,
} from "./BrainDiagnostics";
import { BrainEditor } from "./BrainEditor";
import { ConfirmDialog } from "./ConfirmDialog";
import { NameInputDialog } from "./NameInputDialog";

/** Tailwind classes for a bare glyph-only trigger button, such as the `...` actions menu trigger. */
const ICON_TRIGGER_CLASSES =
  "inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground";

interface BrainDamageNoticeProps {
  /** Document id of the damaged brain. */
  brainId: string;
  /** Why the brain's source in the MakeCode project is damaged, carried as `data-code`. */
  code: BrainDamageCode;
  /** Whether the brains store holds a copy of the brain to restore the project's source from. */
  restorable: boolean;
  /** Whether the brains store is reconciled with the project; Restore is disabled while this is `false`. */
  reconciled: boolean;
  /** The brains store a Restore asks to re-push the brain. */
  brains: Pick<BrainsStore, "repushBrain">;
}

/**
 * The notice below a brain row whose source in the MakeCode project is
 * damaged, worded for the person authoring and carrying the damage's stable
 * code as `data-code`. When `restorable`, it offers Restore, which re-pushes
 * the held copy over the damaged source, carrying the brain's id as
 * `data-brain-id` and disabled unless `reconciled`; otherwise it says to fix
 * or delete the file in MakeCode.
 */
export function BrainDamageNotice({ brainId, code, restorable, reconciled, brains }: BrainDamageNoticeProps) {
  return (
    <div
      data-testid="brain-damaged-notice"
      data-code={code}
      className="flex items-center gap-2 border-border border-t bg-muted/40 px-3 py-2 text-xs"
    >
      <CircleAlert aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-destructive" />
      <p className="min-w-0 flex-1">
        {restorable
          ? "This brain's file in the MakeCode project is broken."
          : "This brain's file in the MakeCode project is broken. Fix or delete it in MakeCode."}
      </p>
      {restorable && (
        <button
          type="button"
          data-testid="brain-restore"
          data-brain-id={brainId}
          disabled={!reconciled}
          className="shrink-0 rounded-md border border-border bg-background px-2 py-1 font-medium text-foreground text-xs hover:bg-muted disabled:opacity-50"
          onClick={() => brains.repushBrain(brainId)}
        >
          Restore
        </button>
      )}
    </div>
  );
}

/**
 * The notice below a brain row whose rules use project assets the MakeCode
 * project no longer holds, worded for the person authoring and naming each
 * asset by its label, carrying {@link BRAIN_ASSET_UNRESOLVED} as
 * `data-code`. Informational: the brain still runs as it did.
 */
export function BrainAssetNotice({ literals }: { literals: readonly AssetLiteral[] }) {
  return (
    <div
      data-testid="brain-asset-notice"
      data-code={BRAIN_ASSET_UNRESOLVED}
      className="flex items-center gap-2 border-border border-t bg-muted/40 px-3 py-2 text-xs"
    >
      <CircleAlert aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1">
        This brain uses {literals.map((literal) => literal.label).join(", ")}, which the MakeCode project doesn't have
        anymore. Add it back in MakeCode, or pick something else in the brain.
      </p>
    </div>
  );
}

type BrainDialog =
  | { kind: "add" }
  | { kind: "rename"; id: string; name: string }
  | { kind: "remove"; id: string; name: string }
  | null;

/**
 * The brains of the brains store: a row per brain, keyed and addressed by its
 * document id and showing its name, with an edit affordance, a diagnostics
 * badge that expands the brain's coded diagnostics, and an actions menu to
 * rename or remove it; an empty state while there are none; and an add
 * action that names a new brain and opens the brain editor on it. Each row
 * carries its brain's document id as `data-brain-id` and its name as
 * `data-brain-name`.
 *
 * A brain whose rules use project assets the project no longer holds shows a
 * {@link BrainAssetNotice} below its row. A brain whose source in the MakeCode
 * project is damaged shows a {@link BrainDamageNotice} below its row, offering Restore while the store
 * is reconciled with the project. A damaged brain
 * the store holds no copy of is listed after the held brains under the name
 * the project gave it, with the notice alone and no other controls. While the
 * store's catalog is pending, a brain placing unresolved tiles shows no
 * diagnostics badge. The brain editor it opens fills tiles in `tileColors`
 * where they are given.
 */
export function BrainList({ tileColors }: { tileColors?: TileKindColors }) {
  const store = useBrains();
  const { brains, damaged, reconciled, unresolvedAssets, catalogPending } = useBrainsState();
  const uncopied = [...damaged].filter(([id]) => !brains.has(id));
  const [dialog, setDialog] = useState<BrainDialog>(null);
  const [editingBrainId, setEditingBrainId] = useState<string | null>(null);
  const [expandedDiagnostics, setExpandedDiagnostics] = useState<ReadonlySet<string>>(new Set());
  // Each listed brain's Edit button, so the add flow can put the keyboard on the
  // new brain's row before opening the editor over it.
  const editButtons = useRef(new Map<string, HTMLButtonElement>());
  // The brain the add dialog just created, read once the dialog has closed.
  const brainToOpenAfterNaming = useRef<string | null>(null);
  const headingId = useId();

  /**
   * Opens the editor on the brain the add dialog just named, having first put the
   * keyboard on that brain's Edit button so closing the editor lands there. Does
   * nothing when the dialog closed without creating a brain, leaving its own
   * focus restoration to stand.
   */
  function openNamedBrain(event: Event) {
    const brainId = brainToOpenAfterNaming.current;
    brainToOpenAfterNaming.current = null;
    if (brainId === null) {
      return;
    }
    const editButton = editButtons.current.get(brainId);
    if (editButton) {
      event.preventDefault();
      editButton.focus();
    }
    setEditingBrainId(brainId);
  }

  return (
    <section data-testid="brain-list" aria-labelledby={headingId} className="w-full max-w-md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="font-bold text-base">
          Brains
        </h2>
        <Button type="button" size="sm" data-testid="add-brain-button" onClick={() => setDialog({ kind: "add" })}>
          <Plus />
          Add brain
        </Button>
      </div>

      {brains.size === 0 && uncopied.length === 0 ? (
        <div
          data-testid="brain-list-empty"
          className="mt-3 rounded-lg border border-border border-dashed p-6 text-center"
        >
          <p className="text-muted-foreground text-sm">No brains yet. Create one to get started.</p>
          <Button type="button" size="sm" className="mt-3" onClick={() => setDialog({ kind: "add" })}>
            <Plus />
            Add brain
          </Button>
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          <ul className="divide-y divide-border">
            {[...brains].map(([id, brain]) => {
              const diagnostics = listedDiagnostics(brain, catalogPending);
              const diagnosticsExpanded = expandedDiagnostics.has(id) && diagnostics.length > 0;
              const damage = damaged.get(id);
              const unresolved = unresolvedAssets.get(id);
              return (
                <li
                  key={id}
                  data-testid="brain-item"
                  data-brain-id={id}
                  data-brain-name={brain.name}
                  className="flex flex-col"
                >
                  <div className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-muted/50">
                    <button
                      type="button"
                      aria-label={`Edit ${brain.name}`}
                      className="min-w-0 flex-1 wrap-break-word text-left text-sm hover:underline"
                      onClick={() => setEditingBrainId(id)}
                    >
                      {brain.name}
                    </button>
                    <div className="flex items-center gap-1">
                      {diagnostics.length > 0 && (
                        <BrainErrorBadge
                          count={diagnostics.length}
                          compileState={brainCompileState(brain)}
                          expanded={diagnosticsExpanded}
                          onToggle={() => setExpandedDiagnostics((previous) => toggledBrainId(previous, id))}
                          brainName={brain.name}
                        />
                      )}
                      <button
                        type="button"
                        ref={(element) => {
                          if (element) {
                            editButtons.current.set(id, element);
                          } else {
                            editButtons.current.delete(id);
                          }
                        }}
                        data-testid="brain-edit"
                        data-brain-id={id}
                        aria-label={`Edit ${brain.name}`}
                        className="rounded px-2 py-1 font-medium text-foreground text-xs hover:bg-muted"
                        onClick={() => setEditingBrainId(id)}
                      >
                        Edit
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            data-testid="brain-actions"
                            data-brain-id={id}
                            className={ICON_TRIGGER_CLASSES}
                            aria-label={`More actions for ${brain.name}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="border-border">
                          <DropdownMenuItem
                            data-testid="brain-rename"
                            data-brain-id={id}
                            onClick={() => setDialog({ kind: "rename", id, name: brain.name })}
                          >
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            data-testid="brain-remove"
                            data-brain-id={id}
                            className="text-destructive focus:text-destructive data-highlighted:text-destructive"
                            onClick={() => setDialog({ kind: "remove", id, name: brain.name })}
                          >
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  {damage !== undefined && (
                    <BrainDamageNotice
                      brainId={id}
                      code={damage.code}
                      restorable
                      reconciled={reconciled}
                      brains={store}
                    />
                  )}
                  {unresolved !== undefined && <BrainAssetNotice literals={unresolved} />}
                  {diagnosticsExpanded && <BrainDiagnosticsList diagnostics={diagnostics} />}
                </li>
              );
            })}
            {uncopied.map(([id, damage]) => (
              <li
                key={id}
                data-testid="brain-item"
                data-brain-id={id}
                data-brain-name={damage.name}
                className="flex flex-col"
              >
                <div className="px-3 py-2">
                  <span className="wrap-break-word text-sm">{damage.name}</span>
                </div>
                <BrainDamageNotice
                  brainId={id}
                  code={damage.code}
                  restorable={false}
                  reconciled={reconciled}
                  brains={store}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {dialog?.kind === "add" && (
        <NameInputDialog
          title="Add brain"
          submitLabel="Add"
          onSubmit={(name) => {
            brainToOpenAfterNaming.current = store.addBrain(name);
          }}
          onClose={() => setDialog(null)}
          onCloseAutoFocus={openNamedBrain}
        />
      )}
      {dialog?.kind === "rename" && (
        <NameInputDialog
          title="Rename brain"
          submitLabel="Rename"
          initialValue={dialog.name}
          onSubmit={(name) => store.renameBrain(dialog.id, name)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "remove" && (
        <ConfirmDialog
          title="Remove brain"
          message={`Remove "${dialog.name}"? This cannot be undone.`}
          confirmLabel="Remove"
          destructive
          onConfirm={() => store.removeBrain(dialog.id)}
          onClose={() => setDialog(null)}
        />
      )}
      {editingBrainId !== null && (
        <BrainEditor
          key={editingBrainId}
          brainId={editingBrainId}
          tileColors={tileColors}
          onClose={() => setEditingBrainId(null)}
        />
      )}
    </section>
  );
}
