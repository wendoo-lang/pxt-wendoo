import { logger } from "@wendoo/core/app";
import { MakeCodeBrainsError } from "@wendoo/makecode-session";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wendoo/ui";
import { CircleAlert, MoreHorizontal, Plus } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useBrains, useBrainsState } from "@/contexts/brains";
import { useEditorRequests } from "@/contexts/editor-requests";
import type { BrainDamageCode, BrainsStore, BrainsViewState } from "@/services/brains-store";
import type { EditorRequest } from "@/services/editor-requests";
import type { TileKindColors } from "@/services/target-theme";
import type { AssetLiteral } from "../../authoring/asset-literals";
import { BRAIN_ASSET_UNRESOLVED } from "../../authoring/asset-literals";
// Exception: the editor entry does not import the simx entry's production
// code. This one import is ruled in, so the decoder stays beside the encoder
// it reverses; any further src/editor -> src/simx import needs its own
// explicit ruling.
import { brainIdOfQualifiedName } from "../../simx/brains-module";
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

interface OpenInOriginActionProps {
  /** Document id of the brain, carried as `data-key`. */
  brainId: string;
  /** The brain's display name, which the action's accessible name carries. */
  brainName: string;
  /** The label of the brain's origin tab as MakeCode lists it, or `null` when no such tab is listed. */
  originLabel: string | null;
  /** The brains store the action asks to open the brain in its origin. */
  brains: Pick<BrainsStore, "openBrainInOrigin">;
}

/**
 * The one action of a brain row whose brain another tab made: a button
 * captioned with the origin tab's label, carrying `data-action="open-origin"`
 * and the brain's id as `data-key`, that asks the brains store to open the
 * brain in that tab. Renders nothing while `originLabel` is `null`.
 */
export function OpenInOriginAction({ brainId, brainName, originLabel, brains }: OpenInOriginActionProps) {
  if (originLabel === null) return null;
  return (
    <button
      type="button"
      data-action="open-origin"
      data-key={brainId}
      aria-label={`Open ${brainName} in ${originLabel}`}
      className="rounded px-2 py-1 font-medium text-foreground text-xs hover:bg-muted"
      onClick={() => {
        void brains.openBrainInOrigin(brainId);
      }}
    >
      {`Open in ${originLabel}`}
    </button>
  );
}

/** The dialog open over the brain list: naming a new brain, renaming or removing brain `id`, or none. */
export type BrainDialog =
  | { kind: "add" }
  | { kind: "rename"; id: string; name: string }
  | { kind: "remove"; id: string; name: string }
  | null;

/** Stable code logged at warn level for an open request naming no brain the store holds, with the `qName` it named or the `brainId` that denotes. */
export const EDITOR_OPEN_UNKNOWN_BRAIN = "EDITOR_OPEN_UNKNOWN_BRAIN";

/** The brain list's state a create request changes. */
export interface CreateRequestView {
  /** Opens the brain editor on the brain with this document id; `null` closes it. */
  setEditingBrainId(id: string | null): void;
  /** Opens this dialog over the list, in place of any open one; `null` closes it. */
  setDialog(dialog: BrainDialog): void;
}

/** The brain list's state an open request reads and changes. */
export interface OpenRequestView extends CreateRequestView {
  /** The brains the store holds, keyed by document id. */
  readonly brains: BrainsViewState["brains"];
  /** Whether the store is reconciled with the project; until it is, `brains` may lack the project's brains. */
  readonly reconciled: boolean;
  /** Holds the brain with this document id to open once the store is reconciled, in place of any held; `null` holds none. */
  holdOpen(brainId: string | null): void;
  /** Puts the keyboard on the Edit button of the listed brain with this document id, if it is listed. */
  focusEditButton(brainId: string): void;
}

/**
 * Answers a create request on the brain list whose state `view` sets: closes
 * the brain editor, if open, which flushes its latest edit, then opens the add
 * dialog, the one the add action opens.
 */
export function answerCreateRequest(view: CreateRequestView): void {
  view.setEditingBrainId(null);
  view.setDialog({ kind: "add" });
}

/**
 * Answers an open request for the brain `brainId` on the brain list whose
 * state `view` reads and sets. While the store is not reconciled, holds the
 * brain to answer for once it is. When the store holds the brain, closes any
 * open dialog, puts the keyboard on the brain's Edit button, then opens the
 * brain editor on it: an editor open on another brain is replaced, flushing
 * that brain's latest edit, and one open on this brain stays open. Otherwise
 * logs {@link EDITOR_OPEN_UNKNOWN_BRAIN} and leaves the list as it is.
 */
export function answerOpenRequest(view: OpenRequestView, brainId: string): void {
  if (!view.reconciled) {
    view.holdOpen(brainId);
    return;
  }
  if (!view.brains.has(brainId)) {
    logger.warn(EDITOR_OPEN_UNKNOWN_BRAIN, { brainId });
    return;
  }
  view.setDialog(null);
  view.focusEditButton(brainId);
  view.setEditingBrainId(brainId);
}

/**
 * Opens the brain editor on the brain `brainId` a create made, on the brain
 * list whose state `view` reads and sets: puts the keyboard on the brain's
 * Edit button, then opens the editor on it. Returns whether it did; a brain
 * the store does not hold yet changes nothing.
 */
export function answerCreatedBrain(view: OpenRequestView, brainId: string): boolean {
  if (!view.brains.has(brainId)) return false;
  view.focusEditButton(brainId);
  view.setEditingBrainId(brainId);
  return true;
}

/**
 * Answers `request` on the brain list whose state `view` reads and sets, by
 * its kind, first dropping any open request held: a create request with
 * {@link answerCreateRequest}; an open request with {@link answerOpenRequest}
 * for the brain it names by document id or the brain its instance name
 * denotes, or, when the name denotes none, by logging
 * {@link EDITOR_OPEN_UNKNOWN_BRAIN}.
 */
export function answerEditorRequest(view: OpenRequestView, request: EditorRequest): void {
  view.holdOpen(null);
  if (request.kind === "create") {
    answerCreateRequest(view);
    return;
  }
  if ("brainId" in request) {
    answerOpenRequest(view, request.brainId);
    return;
  }
  const brainId = brainIdOfQualifiedName(request.qName);
  if (brainId === undefined) {
    logger.warn(EDITOR_OPEN_UNKNOWN_BRAIN, { qName: request.qName });
    return;
  }
  answerOpenRequest(view, brainId);
}

/**
 * The brains of the brains store: one row per brain, keyed by its document
 * id, an empty state while there are none, and an add action. The rows and
 * their actions are as the BRAIN LIST passage of docs/session-management.md
 * describes, and their notices as its DAMAGED BRAINS and UNRESOLVED ASSET
 * LITERALS passages do. The brain editor it opens fills
 * tiles in `tileColors` where they are given. It answers each of the
 * editor's requests, the one held before it mounted included, with
 * {@link answerEditorRequest}; mount it under an `EditorRequestsProvider`.
 */
export function BrainList({ tileColors }: { tileColors?: TileKindColors }) {
  const store = useBrains();
  const { brains, damaged, reconciled, unresolvedAssets, catalogPending, tabKey } = useBrainsState();
  const uncopied = [...damaged].filter(([id]) => !brains.has(id));
  const [dialog, setDialog] = useState<BrainDialog>(null);
  const [editingBrainId, setEditingBrainId] = useState<string | null>(null);
  const [expandedDiagnostics, setExpandedDiagnostics] = useState<ReadonlySet<string>>(new Set());
  // Each listed brain's Edit button, so the add flow can put the keyboard on the
  // new brain's row before opening the editor over it.
  const editButtons = useRef(new Map<string, HTMLButtonElement>());
  // The brain an open request named before the store reconciled, opened once it has.
  const heldOpenBrainId = useRef<string | null>(null);
  // The brain a create resolved with, opened once a render holds its row.
  const [createdBrainId, setCreatedBrainId] = useState<string | null>(null);
  const headingId = useId();
  const requests = useEditorRequests();

  /** The list's state as a request reads and sets it now. */
  const requestView = useCallback((): OpenRequestView => {
    const snapshot = store.getSnapshot();
    return {
      setEditingBrainId,
      setDialog,
      brains: snapshot.brains,
      reconciled: snapshot.reconciled,
      holdOpen: (brainId) => {
        heldOpenBrainId.current = brainId;
      },
      focusEditButton: (brainId) => {
        editButtons.current.get(brainId)?.focus();
      },
    };
  }, [store]);

  useEffect(() => requests.take((request) => answerEditorRequest(requestView(), request)), [requests, requestView]);

  useEffect(() => {
    const brainId = heldOpenBrainId.current;
    if (!reconciled || brainId === null) {
      return;
    }
    heldOpenBrainId.current = null;
    answerOpenRequest(requestView(), brainId);
  }, [reconciled, requestView]);

  useEffect(() => {
    if (createdBrainId === null || !brains.has(createdBrainId)) return;
    if (answerCreatedBrain(requestView(), createdBrainId)) setCreatedBrainId(null);
  }, [createdBrainId, brains, requestView]);

  /**
   * Asks the store to create a brain named `name`, and once the store holds
   * it and its row is drawn opens the editor on it with
   * {@link answerCreatedBrain}. A creation that fails is logged by its code
   * and opens nothing.
   */
  function addNamedBrain(name: string) {
    store.addBrain(name).then(setCreatedBrainId, (error: unknown) => {
      if (error instanceof MakeCodeBrainsError) logger.warn(error.code, { name });
    });
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
              const foreign = brain.origin !== null && brain.origin !== tabKey;
              return (
                <li
                  key={id}
                  data-testid="brain-item"
                  data-brain-id={id}
                  data-brain-name={brain.name}
                  className="flex flex-col"
                >
                  <div className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-muted/50">
                    {foreign ? (
                      <span className="min-w-0 flex-1 wrap-break-word text-sm">{brain.name}</span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Edit ${brain.name}`}
                        className="min-w-0 flex-1 wrap-break-word text-left text-sm hover:underline"
                        onClick={() => setEditingBrainId(id)}
                      >
                        {brain.name}
                      </button>
                    )}
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
                      {foreign ? (
                        <OpenInOriginAction
                          brainId={id}
                          brainName={brain.name}
                          originLabel={brain.originLabel}
                          brains={store}
                        />
                      ) : (
                        <>
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
                        </>
                      )}
                    </div>
                  </div>
                  {damage !== undefined && (
                    <BrainDamageNotice
                      brainId={id}
                      code={damage.code}
                      restorable={!foreign}
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
        <NameInputDialog title="Add brain" submitLabel="Add" onSubmit={addNamedBrain} onClose={() => setDialog(null)} />
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
