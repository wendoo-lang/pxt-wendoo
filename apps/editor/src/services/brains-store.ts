import type { IBrainDef, WendooEnvironment } from "@wendoo/core/app";
import { BrainDef } from "@wendoo/core/app";
import type { BrainBuildDiagnostic } from "@wendoo/core/brain";
import type { TypeId } from "@wendoo/core/runtime";
import type {
  MakeCodeAsset,
  MakeCodeBrain,
  MakeCodeBrainPush,
  MakeCodeBrainSummary,
  MakeCodeIdManifest,
  MakeCodeManifestReading,
} from "@wendoo/makecode-session";
import { brainSourceHash, MakeCodeManifestProblemCode } from "@wendoo/makecode-session";
import type { AssetLiteral } from "./asset-literals";
import type { AuthoringEnvironment, CatalogDiagnostic, PackLiteral, TypePage } from "./authoring-environment";
import { buildAuthoringEnvironment } from "./authoring-environment";
import type { BrainLiteral, UnresolvedBrainReference } from "./brain-literals";
import type { BrainSourceCompile } from "./brain-source";
import {
  BRAIN_SOURCE_ID_MISMATCH,
  BRAIN_SOURCE_INVALID,
  compileBrainSource,
  readBrainSource,
  serializeBrainSource,
} from "./brain-source";
import { parseCatalog } from "./catalog";
import type { EditorBrainsChannel, EditorSessionStore, EditorSessionViewState } from "./editor-session-store";
import { allocateIds, emptyIdManifest, mergeIdManifests, sameIdManifest } from "./id-allocation";

/**
 * The delays, in milliseconds, before each retry of a failed push of a
 * brain's latest edit, and before each re-run of a failed reconciliation:
 * the first retry waits the first delay, each retry that fails waits the
 * next, and every retry after the last waits the last.
 */
export const PUSH_RETRY_DELAYS_MS: readonly number[] = [500, 1000, 2000, 4000, 8000];

/**
 * How long, in milliseconds, a push may go unanswered before the store
 * treats it as failed and retries it (see {@link PUSH_RETRY_DELAYS_MS}). Its
 * brain stays pending, and an answer arriving later still counts.
 */
export const PUSH_LIVENESS_DEADLINE_MS = 30_000;

/** The delay before retry number `attempt + 1`: {@link PUSH_RETRY_DELAYS_MS} at `attempt`, or its last delay past the end. */
function retryDelay(attempt: number): number {
  return PUSH_RETRY_DELAYS_MS[Math.min(attempt, PUSH_RETRY_DELAYS_MS.length - 1)] ?? 0;
}

/** The session readings a {@link BrainsStore} follows. */
export type BrainsSessionState = Pick<EditorSessionViewState, "status" | "catalogText" | "assets">;

/** The session a {@link BrainsStore} syncs its brains with the MakeCode project over. */
export type BrainsSyncSource = Pick<EditorSessionStore, "onBrainsChannel">;

/** The session a {@link BrainsStore} follows, in the `useSyncExternalStore` shape: a subscribe function and a snapshot reader. */
export interface BrainsSessionSource {
  /** Subscribe to reading changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** The current reading. */
  getSnapshot(): BrainsSessionState;
}

/** A brain's last successful compile. */
export interface CompiledBrain {
  /** The compiled program in the binary form the MakeCode Wendoo VM loads. */
  readonly bytecode: Uint8Array;
  /** Hash of the source text the bytecode was compiled from. */
  readonly sourceHash: string;
}

/** One brain the store holds. */
export interface BrainEntry {
  /** The brain's display name, as its document carries it. */
  readonly name: string;
  /** The brain's source text: its latest applied document, serialized. */
  readonly source: string;
  /** Hash of {@link source}. */
  readonly sourceHash: string;
  /** Diagnostics of compiling {@link source}, in the order they were reported. */
  readonly diagnostics: readonly BrainBuildDiagnostic[];
  /**
   * The latest compile that produced bytecode, or `undefined` when none has.
   * It compiled {@link source} exactly when its `sourceHash` equals
   * {@link sourceHash}; otherwise the latest compile failed and this is the
   * last good one.
   */
  readonly compiled: CompiledBrain | undefined;
}

/**
 * Why the project's source of a brain is damaged: {@link BRAIN_SOURCE_INVALID}
 * when it is not a brain document, {@link BRAIN_SOURCE_ID_MISMATCH} when it is
 * one whose embedded id differs from the id the project addresses it by.
 */
export type BrainDamageCode = typeof BRAIN_SOURCE_INVALID | typeof BRAIN_SOURCE_ID_MISMATCH;

/** The damage found in the MakeCode project's source of one brain. */
export interface BrainDamage {
  /** Why the source is damaged. */
  readonly code: BrainDamageCode;
  /** The brain's display name as the project gave it with the damaged source; any text, including empty. */
  readonly name: string;
}

/** What the editor reads from the brains store. */
export interface BrainsViewState {
  /** The environment built from the session's latest catalog and the id allocation held, for reading, editing and compiling brains. */
  readonly environment: WendooEnvironment;
  /** Problems found in the session's latest catalog, in catalog order, then the manifest problem when there is one. */
  readonly catalogDiagnostics: readonly CatalogDiagnostic[];
  /** The brains, keyed by document id, in the order they were first stored. */
  readonly brains: ReadonlyMap<string, BrainEntry>;
  /**
   * Ids of the brains whose latest edit -- add, apply, rename or removal --
   * the MakeCode project has not acknowledged, in the order first recorded:
   * edits made while no reconciled handshake could carry them, edits whose
   * push is in flight, and edits whose push failed. An id leaves the set when the project acknowledges a
   * push carrying its latest edit, however late; acknowledging a push of an
   * earlier edit leaves it pending. An id the brains do not hold names a
   * removal.
   */
  readonly pending: ReadonlySet<string>;
  /**
   * How many pushes have gone out and await the project's answer, not
   * counting those unanswered past {@link PUSH_LIVENESS_DEADLINE_MS}.
   */
  readonly pushesInFlight: number;
  /**
   * Brains whose source in the MakeCode project is damaged, keyed by
   * document id, each with its damage: found on a pull, and
   * cleared when a later reconciliation finds the source repaired or gone,
   * or when the project acknowledges a push of the brain. The store never pushes a damaged brain by itself, and edits to
   * one stay pending; when {@link brains} holds the brain,
   * {@link BrainsStore.repushBrain} restores the project from that copy.
   */
  readonly damaged: ReadonlyMap<string, BrainDamage>;
  /**
   * The environment's asset literal tiles, keyed by tile id: one per asset of
   * a catalog asset type the session's latest asset snapshot lists, and one
   * per such literal a held brain references, unresolved while the snapshot
   * does not list its asset.
   */
  readonly assetLiterals: ReadonlyMap<string, AssetLiteral>;
  /**
   * The unresolved asset literals each brain references, keyed by document
   * id, for each brain referencing any, while a snapshot is held. Such a
   * brain compiles as it did while its assets were listed.
   */
  readonly unresolvedAssets: ReadonlyMap<string, readonly AssetLiteral[]>;
  /**
   * The environment's brain literal tiles, keyed by tile id: one per held
   * brain for each catalog brain type, and one per such literal a held brain
   * references, unresolved while the store does not hold its brain.
   */
  readonly brainLiterals: ReadonlyMap<string, BrainLiteral>;
  /** The environment's type icons, keyed by type id, as {@link AuthoringEnvironment.typeIcons} holds them. */
  readonly typeIcons: ReadonlyMap<TypeId, string>;
  /** The environment's type labels, keyed by type id, as {@link AuthoringEnvironment.typeLabels} holds them. */
  readonly typeLabels: ReadonlyMap<TypeId, string>;
  /** The environment's page icon, as {@link AuthoringEnvironment.pageIcon} holds it. */
  readonly pageIcon: string | undefined;
  /** The environment's pack literals, keyed by tile id, as {@link AuthoringEnvironment.packLiterals} holds them. */
  readonly packLiterals: ReadonlyMap<string, PackLiteral>;
  /** The environment's type pages, as {@link AuthoringEnvironment.typePages} holds them. */
  readonly typePages: readonly TypePage[];
  /**
   * The unresolved brain literals each brain references, keyed by document
   * id, for each brain referencing any, each carrying its stable code. Such
   * a brain compiles as it did while the brains it names were held.
   */
  readonly unresolvedBrains: ReadonlyMap<string, readonly UnresolvedBrainReference[]>;
  /**
   * `true` while the session is connected and the latest handshake's
   * reconciliation has finished, so edits and re-pushes reach the MakeCode
   * project at once; `false` from the next disconnection, and while a new
   * handshake is reconciling.
   */
  readonly reconciled: boolean;
}

/**
 * The editor's brains as the UI consumes them: brain documents keyed by
 * document id, each with its compile state, compiled in an environment built
 * from the followed session's catalog and rebuilt whenever a different
 * catalog arrives. Components read {@link getSnapshot} and subscribe with
 * {@link subscribe} (both `useSyncExternalStore`-shaped).
 *
 * Every document written to the store is compiled at once in the current
 * environment. A failed compile keeps the document and records its
 * diagnostics, beside the last good compile. A document whose source text
 * equals the source the store holds for its brain changes nothing: it is not
 * compiled, and no edit is recorded.
 *
 * The environment binds the catalog's packs under the project's id
 * allocation, which the store holds once a handshake has read the project's
 * manifest: it adopts what the manifest holds over its own allocation
 * (`mergeIdManifests`), allocates every name the catalog declares that it
 * lacks (`allocateIds`), and writes the whole allocation to the project
 * whenever it differs from what the project holds -- never over a manifest of
 * a newer format, which leaves every pack unbound. A catalog arriving with
 * new vocabulary is allocated and written the same way. A failed manifest
 * write, or one unanswered for {@link PUSH_LIVENESS_DEADLINE_MS}, is retried
 * after each of {@link PUSH_RETRY_DELAYS_MS} in turn, then after the last of
 * them again and again, while its handshake stays connected. Whenever the
 * environment is rebuilt, every brain is recompiled in it; one whose
 * compiled form changes is recorded as edited, and pushed.
 *
 * The environment's asset literals follow the session's asset snapshot: a
 * literal per listed asset of a catalog asset type, and a literal per such
 * literal any brain source references, bound before the source is read or
 * compiled, so a brain compiles to the same program whether or not the
 * snapshot lists its assets. A snapshot arriving, renaming, redrawing,
 * adding, deleting or restoring an asset updates the literals in place: it
 * never rebuilds the environment, recompiles a brain, or pushes one.
 *
 * The environment's brain literals follow the held brains the same way: a
 * literal per held brain of a catalog brain type, and a literal per such
 * literal any brain source references, bound before the source is read or
 * compiled. Adding, renaming or removing a brain updates the literals in
 * place, and a brain naming a brain the store no longer holds is reported
 * under {@link BrainsViewState.unresolvedBrains}.
 *
 * Given a sync source, the store keeps its brains in step with the MakeCode
 * project over each makecode handshake. When a handshake completes, the
 * store reconciles: a handshake of a different binding than the previous
 * one first replaces the brains, discarding every local brain and pend and
 * the id allocation; it reads the project's manifest and lists the
 * project's brains, pulls those whose source differs from the
 * store's or whose compiled form the list reports missing or compiled from
 * other source, adopts each pulled brain it holds no pending edit of, drops
 * each brain the project no longer holds that has no pending edit, then
 * pushes every pend. A failed reconciliation is re-run over the same
 * handshake after each of {@link PUSH_RETRY_DELAYS_MS} in turn, and then
 * after the last of them again and again, while the session stays connected
 * and no later handshake has completed. A pulled source that is not a brain
 * document is listed in {@link BrainsViewState.damaged} and never overwritten
 * by itself; a pulled source whose compiled form was not compiled from it,
 * or whose compile now makes another program, is recompiled and, when that
 * compile succeeds, pushed. Once reconciled, each
 * edit is pushed as it is made, pending until the project acknowledges it.
 * A push left unanswered for {@link PUSH_LIVENESS_DEADLINE_MS} counts as
 * failed. A failed push of a brain's latest edit is retried, unless the brain
 * is listed damaged, after each of {@link PUSH_RETRY_DELAYS_MS} in turn and
 * then after the last of them, again and again, while the handshake it went
 * out on stays reconciled and connected; every pend is pushed when the next
 * handshake has reconciled. A push carries the brain as the store holds it:
 * its source and the compiled form and hash of one compile.
 */
export class BrainsStore {
  private readonly _session: BrainsSessionSource;
  private readonly _sync: BrainsSyncSource | undefined;
  private readonly _listeners = new Set<() => void>();
  private _catalogText: string | undefined;
  /** The asset snapshot the environment's asset literals follow, as the session reported it. */
  private _assets: readonly MakeCodeAsset[] | undefined;
  /** The unresolved asset literals each brain referenced when last found, with the brains, literals and snapshot they were found for. */
  private _unresolved:
    | {
        readonly brains: ReadonlyMap<string, BrainEntry>;
        readonly literals: ReadonlyMap<string, AssetLiteral>;
        readonly assets: readonly MakeCodeAsset[] | undefined;
        readonly found: ReadonlyMap<string, readonly AssetLiteral[]>;
      }
    | undefined;
  /** The unresolved brain literals each brain referenced when last found, with the brains and literals they were found for. */
  private _unresolvedBrains:
    | {
        readonly brains: ReadonlyMap<string, BrainEntry>;
        readonly literals: ReadonlyMap<string, BrainLiteral>;
        readonly found: ReadonlyMap<string, readonly UnresolvedBrainReference[]>;
      }
    | undefined;
  /** The id allocation held for the current binding, or `undefined` until a handshake has read the project's manifest. */
  private _ids: MakeCodeIdManifest | undefined;
  /**
   * The allocation the project holds as far as the store knows: from the
   * latest manifest read, an absent manifest reading as allocating nothing,
   * and from each acknowledged write; `undefined` when the project's
   * manifest needs replacing whatever the store holds.
   */
  private _projectIds: MakeCodeIdManifest | undefined;
  /** Whether the project's manifest is of a newer format than this editor reads. */
  private _manifestNewer = false;
  /** Whether a manifest write is awaiting its answer. */
  private _manifestWriting = false;
  /** The scheduled retry of a failed manifest write, if any. */
  private _manifestRetry: ReturnType<typeof setTimeout> | undefined;
  private _environment: AuthoringEnvironment;
  private _brains: ReadonlyMap<string, BrainEntry> = new Map();
  private _pending: ReadonlySet<string> = new Set();
  private _damaged: ReadonlyMap<string, BrainDamage> = new Map();
  /** The channel of the latest handshake, or `undefined` before the first. */
  private _channel: EditorBrainsChannel | undefined;
  /** Whether the latest handshake's reconciliation has finished and the session has stayed connected since. */
  private _reconciled = false;
  /** The scheduled retry of each brain whose latest push failed, by document id. */
  private readonly _retries = new Map<string, ReturnType<typeof setTimeout>>();
  private _pushesInFlight = 0;
  private _state: BrainsViewState;

  /**
   * @param session - The session whose catalog the environment is built from, and whose connectivity decides which edits pend.
   * @param sync - The session the brains are synced with the MakeCode project over. When omitted, the store syncs nothing and pends every edit made while the session is not connected.
   */
  constructor(session: BrainsSessionSource, sync?: BrainsSyncSource) {
    this._session = session;
    this._sync = sync;
    this._catalogText = session.getSnapshot().catalogText;
    this._assets = session.getSnapshot().assets;
    this._environment = this.buildEnvironment();
    this._state = this.readState();
    session.subscribe(() => {
      this.sessionChanged();
    });
    sync?.onBrainsChannel((channel) => {
      this.handshakeCompleted(channel);
    });
  }

  /** Subscribe to snapshot changes. Returns an unsubscribe function. */
  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  };

  /** The current view state. A new object each time any of its fields changes. */
  getSnapshot = (): BrainsViewState => {
    return this._state;
  };

  /**
   * The brain `id` read from its source in the current environment, as a
   * document to edit and hand back to {@link applyBrain}; `undefined` when the
   * store holds no such brain.
   *
   * @param id - Document id of the brain.
   */
  getBrain(id: string): BrainDef | undefined {
    const entry = this._brains.get(id);
    return entry === undefined ? undefined : readBrainSource(this._environment.environment, entry.source);
  }

  /**
   * Creates an empty one-page brain named `name` and stores it as
   * {@link applyBrain} does. Returns its minted document id.
   *
   * @param name - Display name of the brain; any text, including empty or one another brain carries.
   */
  addBrain(name: string): string {
    const definition = BrainDef.emptyBrainDef(this._environment.environment.brainServices, name);
    this.store(definition);
    return definition.id();
  }

  /**
   * Stores `definition` under the document id it carries, replacing any
   * brain held under that id, and compiles it in the current environment.
   * Does nothing when its source text equals the source the store holds for
   * that id.
   *
   * @param definition - The brain document, as edited.
   */
  applyBrain(definition: IBrainDef): void {
    this.store(definition);
  }

  /**
   * Renames the brain `id` to `name` in its document and stores the result
   * as {@link applyBrain} does; its id is unchanged. Does nothing when the
   * store holds no such brain.
   *
   * @param id - Document id of the brain.
   * @param name - New display name; any text, including empty or one another brain carries.
   */
  renameBrain(id: string, name: string): void {
    const definition = this.getBrain(id);
    if (definition === undefined) return;
    definition.setName(name);
    this.store(definition);
  }

  /**
   * Removes the brain `id`. Does nothing when the store holds no such brain.
   *
   * @param id - Document id of the brain.
   */
  removeBrain(id: string): void {
    if (!this._brains.has(id)) return;
    const brains = new Map(this._brains);
    brains.delete(id);
    this._brains = brains;
    this.edited(id);
    this.publish();
  }

  /**
   * Pushes the store's copy of the brain `id` to the MakeCode project over
   * the damaged source the project holds, clearing the damage once the
   * project acknowledges it. Does nothing unless the brain is listed
   * damaged, the store holds it, and the store is reconciled
   * ({@link BrainsViewState.reconciled}).
   *
   * @param id - Document id of the brain.
   */
  repushBrain(id: string): void {
    const channel = this._channel;
    if (!this._damaged.has(id) || !this._brains.has(id) || channel === undefined || !this._reconciled) return;
    this.push(channel, id);
  }

  /**
   * Serializes, compiles and stores `definition`, then records the edit.
   * Does nothing when the store already holds the brain with the same source
   * text.
   */
  private store(definition: IBrainDef): void {
    const id = definition.id();
    const source = serializeBrainSource(definition);
    const held = this._brains.get(id);
    if (held?.source === source) return;
    this._environment.assetLiterals.bindSource(source);
    this._environment.brainLiterals.bindSource(source);
    const sourceHash = brainSourceHash(source);
    const compile = compileBrainSource(this._environment.environment, source);
    const entry: BrainEntry = {
      name: definition.name(),
      source,
      sourceHash,
      diagnostics: compile.diagnostics,
      compiled: compile.bytecode === undefined ? held?.compiled : { bytecode: compile.bytecode, sourceHash },
    };
    this._brains = new Map(this._brains).set(id, entry);
    this.edited(id);
    this.publish();
  }

  /**
   * Records an edit of the brain `id` pending, and pushes it when a
   * connected handshake has reconciled and the brain is not damaged. With no
   * sync source, records it pending only when the session is not connected.
   */
  private edited(id: string): void {
    const connected = this._session.getSnapshot().status === "connected";
    if (this._sync === undefined) {
      if (!connected) this.recordPending(id);
      return;
    }
    this.recordPending(id);
    const channel = this._channel;
    if (channel !== undefined && this.pushesOver(channel) && !this._damaged.has(id)) {
      this.push(channel, id);
    }
  }

  /** Adds the brain `id` to the pends, keeping the set when it already holds it. */
  private recordPending(id: string): void {
    if (!this._pending.has(id)) this._pending = new Set(this._pending).add(id);
  }

  /** Whether a reconciliation over `channel` can reach the project now: it is the latest handshake's, and the session is connected. */
  private reconcilesOver(channel: EditorBrainsChannel): boolean {
    return this._channel === channel && this._session.getSnapshot().status === "connected";
  }

  /** Whether edits reach the project over `channel` now: it is the latest handshake's, reconciled, and the session is connected. */
  private pushesOver(channel: EditorBrainsChannel): boolean {
    return this._channel === channel && this._reconciled && this._session.getSnapshot().status === "connected";
  }

  /**
   * Pushes the store's latest state of the brain `id` over `channel`: its
   * entry, or its removal when the store holds none. Records the brain
   * pending, counts the push in flight until it is answered or
   * {@link PUSH_LIVENESS_DEADLINE_MS} passes, whichever comes first, and
   * cancels any retry scheduled for the brain. An acknowledgment counts
   * whenever it arrives; a failure, or the deadline passing, counts once.
   *
   * @param attempt - How many failed pushes of the same state precede this one: 0 for a first push.
   */
  private push(channel: EditorBrainsChannel, id: string, attempt = 0): void {
    clearTimeout(this._retries.get(id));
    this._retries.delete(id);
    const entry = this._brains.get(id);
    const push: MakeCodeBrainPush =
      entry === undefined
        ? { op: "remove", brainId: id }
        : { op: "write", brain: { id, name: entry.name, source: entry.source, compiled: entry.compiled } };
    this.recordPending(id);
    this._pushesInFlight += 1;
    this.publish();
    let live = true;
    /** Stops counting the push in flight; returns whether it was still counted. */
    const land = (): boolean => {
      if (!live) return false;
      live = false;
      clearTimeout(deadline);
      this._pushesInFlight -= 1;
      return true;
    };
    const deadline = setTimeout(() => {
      if (land()) this.pushFailed(channel, id, entry, attempt);
    }, PUSH_LIVENESS_DEADLINE_MS);
    channel.pushBrain(push).then(
      () => {
        land();
        this.pushAcknowledged(id, entry);
      },
      () => {
        if (land()) this.pushFailed(channel, id, entry, attempt);
      }
    );
  }

  /**
   * Clears the damage of the brain `id`, whose push of `pushed` -- its entry
   * then, `undefined` for a removal -- the project acknowledged, and clears
   * its pend, cancelling any scheduled retry, when `pushed` is still its
   * latest state. Publishes.
   */
  private pushAcknowledged(id: string, pushed: BrainEntry | undefined): void {
    if (this._pending.has(id) && this._brains.get(id) === pushed) {
      const pending = new Set(this._pending);
      pending.delete(id);
      this._pending = pending;
      clearTimeout(this._retries.get(id));
      this._retries.delete(id);
    }
    if (this._damaged.has(id)) {
      const damaged = new Map(this._damaged);
      damaged.delete(id);
      this._damaged = damaged;
    }
    this.publish();
  }

  /**
   * Handles the failure of the push over `channel` of `pushed` -- the brain
   * `id`'s entry then, `undefined` for a removal -- and publishes. When
   * `pushed` is still the brain's latest state, the brain is not damaged,
   * and edits reach the project over `channel`, retries the
   * push after the delay {@link PUSH_RETRY_DELAYS_MS} holds at `attempt`, or
   * its last delay past the end, provided edits still reach the project over
   * `channel` then.
   */
  private pushFailed(channel: EditorBrainsChannel, id: string, pushed: BrainEntry | undefined, attempt: number): void {
    this.publish();
    if (this._brains.get(id) !== pushed || this._damaged.has(id) || !this.pushesOver(channel)) return;
    const retry = setTimeout(() => {
      this._retries.delete(id);
      if (this.pushesOver(channel)) this.push(channel, id, attempt + 1);
    }, retryDelay(attempt));
    this._retries.set(id, retry);
  }

  /** Pushes every pending brain that is not damaged over `channel`. */
  private flush(channel: EditorBrainsChannel): void {
    for (const id of this._pending) {
      if (!this._damaged.has(id)) this.push(channel, id);
    }
  }

  /**
   * Adopts `channel` as the latest handshake's, replacing the brains when
   * it belongs to a different binding than the previous handshake, and
   * reconciles over it.
   */
  private handshakeCompleted(channel: EditorBrainsChannel): void {
    const previous = this._channel;
    const wasReconciled = this._reconciled;
    this._channel = channel;
    this._reconciled = false;
    if (previous !== undefined && previous.binding !== channel.binding) {
      this._brains = new Map();
      this._pending = new Set();
      this._damaged = new Map();
      this._ids = undefined;
      this._projectIds = undefined;
      this._manifestNewer = false;
      this._environment = this.buildEnvironment();
      this.publish();
    } else if (wasReconciled) {
      this.publish();
    }
    void this.reconcile(channel);
  }

  /**
   * Brings the store and the project into step over `channel`: lists, pulls
   * what differs, adopts or records it, drops what the project no longer
   * holds, then pushes the pends and the recompiled brains. Abandoned when a
   * later handshake takes over. When a request fails while the session is
   * connected and `channel` is still the latest handshake's, re-runs after
   * the delay {@link PUSH_RETRY_DELAYS_MS} holds at `attempt`, or its last
   * delay past the end, provided both still hold then.
   *
   * @param attempt - How many failed reconciliations over `channel` precede this one: 0 for the first.
   */
  private async reconcile(channel: EditorBrainsChannel, attempt = 0): Promise<void> {
    let listed: MakeCodeBrainSummary[];
    let wanted: string[];
    let pulled: MakeCodeBrain[];
    try {
      const [reading, list] = await Promise.all([channel.readManifest(), channel.listBrains()]);
      if (this._channel !== channel) return;
      this.adoptManifest(reading);
      this.writeManifest(channel);
      listed = list;
      wanted = listed.filter((summary) => this.wantsPull(summary)).map((summary) => summary.id);
      pulled = wanted.length === 0 ? [] : await channel.pullBrains(wanted);
    } catch {
      if (!this.reconcilesOver(channel)) return;
      setTimeout(() => {
        if (this.reconcilesOver(channel)) void this.reconcile(channel, attempt + 1);
      }, retryDelay(attempt));
      return;
    }
    if (this._channel !== channel) return;

    const brains = new Map(this._brains);
    const damaged = new Map(this._damaged);
    const recompiled: string[] = [];
    for (const brain of pulled) {
      const read = this.readPulled(brain);
      if (typeof read === "string") {
        damaged.set(brain.id, { code: read, name: brain.name });
        continue;
      }
      damaged.delete(brain.id);
      if (this._pending.has(brain.id)) continue;
      brains.set(brain.id, read.entry);
      if (read.recompiled) recompiled.push(brain.id);
    }
    const held = new Set(listed.map((summary) => summary.id));
    const pulledIds = new Set(pulled.map((brain) => brain.id));
    for (const id of wanted) {
      if (!pulledIds.has(id)) held.delete(id);
    }
    for (const id of this._brains.keys()) {
      if (!held.has(id) && !this._pending.has(id)) brains.delete(id);
    }
    for (const id of this._damaged.keys()) {
      if (!held.has(id)) damaged.delete(id);
    }
    this._brains = brains;
    this._damaged = damaged;
    this._reconciled = true;
    this.publish();
    this.flush(channel);
    for (const id of recompiled) this.push(channel, id);
  }

  /**
   * Whether a reconciliation pulls the listed brain: the store holds no copy
   * of it, its copy's source differs, or the project lists its compiled form
   * as missing (`null`) or compiled from other source. A summary carrying no
   * `compiledSourceHash` says nothing about the compiled form.
   */
  private wantsPull(summary: MakeCodeBrainSummary): boolean {
    if (this._brains.get(summary.id)?.sourceHash !== summary.sourceHash) return true;
    const { compiledSourceHash } = summary;
    return compiledSourceHash !== undefined && compiledSourceHash !== summary.sourceHash;
  }

  /**
   * Reads a pulled brain in the current environment: its damage when its
   * source is not a brain document or embeds a different id, and otherwise
   * the entry holding it, compiled at once. A failed compile keeps the
   * pulled compiled form as the last good one. `recompiled` reports a
   * successful compile of a source the pulled compiled form was not
   * compiled from.
   */
  private readPulled(brain: MakeCodeBrain): BrainDamageCode | { entry: BrainEntry; recompiled: boolean } {
    const environment = this._environment.environment;
    this._environment.assetLiterals.bindSource(brain.source);
    this._environment.brainLiterals.bindSource(brain.source);
    let definition: BrainDef;
    try {
      definition = readBrainSource(environment, brain.source);
    } catch {
      return BRAIN_SOURCE_INVALID;
    }
    if (definition.id() !== brain.id) return BRAIN_SOURCE_ID_MISMATCH;
    let compile: BrainSourceCompile;
    try {
      compile = compileBrainSource(environment, brain.source);
    } catch {
      return BRAIN_SOURCE_INVALID;
    }
    const sourceHash = brainSourceHash(brain.source);
    const entry: BrainEntry = {
      name: definition.name(),
      source: brain.source,
      sourceHash,
      diagnostics: compile.diagnostics,
      compiled: compile.bytecode === undefined ? brain.compiled : { bytecode: compile.bytecode, sourceHash },
    };
    const recompiled = compile.bytecode !== undefined && !sameCompiled(brain.compiled, entry.compiled);
    return { entry, recompiled };
  }

  /**
   * Adopts the project's manifest as `reading` reports it: a manifest of a
   * newer format leaves the store holding no allocation; otherwise the store
   * adopts the project's entries over its own, allocates what the catalog
   * declares beyond them, and records what the project holds -- nothing to
   * keep when the manifest was unreadable or damaged. Rebuilds the
   * environment when the allocation changed.
   */
  private adoptManifest(reading: MakeCodeManifestReading): void {
    if (reading.problem === MakeCodeManifestProblemCode.FORMAT_NEWER) {
      this._manifestNewer = true;
      this._projectIds = undefined;
      this.setIds(undefined);
      return;
    }
    this._manifestNewer = false;
    this._projectIds = reading.problem === undefined ? (reading.manifest ?? emptyIdManifest()) : undefined;
    this.setIds(this.allocated(mergeIdManifests(reading.manifest, this._ids)));
  }

  /** `ids` with every name the session's catalog declares allocated. */
  private allocated(ids: MakeCodeIdManifest): MakeCodeIdManifest {
    return this._catalogText === undefined ? ids : allocateIds(ids, parseCatalog(this._catalogText));
  }

  /** Holds `ids` as the allocation, rebuilding the environment and recompiling every brain when it differs from the one held. */
  private setIds(ids: MakeCodeIdManifest | undefined): void {
    const held = this._ids;
    const same = held === undefined || ids === undefined ? held === ids : sameIdManifest(held, ids);
    this._ids = ids;
    if (!same) this.rebuild();
  }

  /**
   * Writes the allocation held to the project over `channel` when it differs
   * from what the project holds, one write at a time: a write asked while
   * one is awaiting its answer goes out once that one is answered. A failed
   * write, or one unanswered for {@link PUSH_LIVENESS_DEADLINE_MS}, is
   * retried after the delay {@link PUSH_RETRY_DELAYS_MS} holds at `attempt`,
   * or its last delay past the end, while `channel` is the latest handshake's
   * and the session is connected.
   *
   * @param attempt - How many failed writes precede this one: 0 for a first write.
   */
  private writeManifest(channel: EditorBrainsChannel, attempt = 0): void {
    const ids = this._ids;
    if (ids === undefined || this._manifestNewer || this._manifestWriting || !this.reconcilesOver(channel)) return;
    if (this._projectIds !== undefined && sameIdManifest(this._projectIds, ids)) return;
    clearTimeout(this._manifestRetry);
    this._manifestRetry = undefined;
    this._manifestWriting = true;
    let live = true;
    /** Ends the write's wait; returns whether it was still waiting. */
    const land = (): boolean => {
      if (!live) return false;
      live = false;
      clearTimeout(deadline);
      this._manifestWriting = false;
      return true;
    };
    const failed = (): void => {
      if (!this.reconcilesOver(channel)) return;
      this._manifestRetry = setTimeout(() => {
        this._manifestRetry = undefined;
        this.writeManifest(channel, attempt + 1);
      }, retryDelay(attempt));
    };
    const deadline = setTimeout(() => {
      if (land()) failed();
    }, PUSH_LIVENESS_DEADLINE_MS);
    channel.writeManifest(ids).then(
      () => {
        if (!land()) return;
        if (this._channel === channel) this._projectIds = ids;
        this.writeManifest(channel);
      },
      () => {
        if (land()) failed();
      }
    );
  }

  /**
   * Rebuilds the environment from the session's catalog and the allocation
   * held, then recompiles every brain in it: a brain whose compiled form
   * changes is recorded as edited, and so is a pending brain whose
   * diagnostics alone change, so its pend clears on the push of its new
   * entry.
   */
  private rebuild(): void {
    this._environment = this.buildEnvironment();
    const brains = new Map(this._brains);
    const edited: string[] = [];
    for (const [id, held] of this._brains) {
      let compile: BrainSourceCompile;
      try {
        compile = compileBrainSource(this._environment.environment, held.source);
      } catch {
        continue;
      }
      const compiled =
        compile.bytecode === undefined ? held.compiled : { bytecode: compile.bytecode, sourceHash: held.sourceHash };
      if (sameCompiled(compiled, held.compiled) && sameDiagnostics(compile.diagnostics, held.diagnostics)) continue;
      brains.set(id, { ...held, diagnostics: compile.diagnostics, compiled });
      if (!sameCompiled(compiled, held.compiled) || this._pending.has(id)) edited.push(id);
    }
    this._brains = brains;
    for (const id of edited) this.edited(id);
  }

  /**
   * The environment for the session's catalog and the allocation held, its
   * asset literals following the held asset snapshot and bound for every
   * held brain's source.
   */
  private buildEnvironment(): AuthoringEnvironment {
    const built = buildAuthoringEnvironment(this._catalogText, this._ids);
    built.assetLiterals.applySnapshot(this._assets);
    built.brainLiterals.applyBrains(this._brains);
    for (const entry of this._brains.values()) {
      built.assetLiterals.bindSource(entry.source);
      built.brainLiterals.bindSource(entry.source);
    }
    return built;
  }

  /**
   * Ends the reconciled state when the session is no longer connected,
   * rebuilds the environment when the session carries a different catalog,
   * and otherwise applies a different asset snapshot to the environment's
   * asset literals in place; publishes when any of them changed.
   */
  private sessionChanged(): void {
    const { status, catalogText, assets } = this._session.getSnapshot();
    const unreconciled = this._reconciled && status !== "connected";
    if (unreconciled) this._reconciled = false;
    const assetsChanged = assets !== this._assets;
    this._assets = assets;
    if (catalogText !== this._catalogText) {
      this._catalogText = catalogText;
      const ids = this._ids === undefined ? undefined : this.allocated(this._ids);
      this._ids = ids;
      this.rebuild();
      if (this._channel !== undefined) this.writeManifest(this._channel);
    } else if (assetsChanged) {
      this._environment.assetLiterals.applySnapshot(assets);
    } else if (!unreconciled) {
      return;
    }
    this.publish();
  }

  /** The unresolved asset literals each held brain references, found again only when the brains, the literals or the snapshot changed. */
  private unresolvedAssets(): ReadonlyMap<string, readonly AssetLiteral[]> {
    const literals = this._environment.assetLiterals;
    const held = this._unresolved;
    if (
      held !== undefined &&
      held.brains === this._brains &&
      held.literals === literals.view &&
      held.assets === this._assets
    ) {
      return held.found;
    }
    const found = new Map<string, readonly AssetLiteral[]>();
    for (const [id, entry] of this._brains) {
      const unresolved = literals.unresolvedIn(entry.source);
      if (unresolved.length > 0) found.set(id, unresolved);
    }
    this._unresolved = { brains: this._brains, literals: literals.view, assets: this._assets, found };
    return found;
  }

  /** The unresolved brain literals each held brain references, found again only when the brains or the literals changed. */
  private unresolvedBrains(): ReadonlyMap<string, readonly UnresolvedBrainReference[]> {
    const literals = this._environment.brainLiterals;
    const held = this._unresolvedBrains;
    if (held !== undefined && held.brains === this._brains && held.literals === literals.view) return held.found;
    const found = new Map<string, readonly UnresolvedBrainReference[]>();
    for (const [id, entry] of this._brains) {
      const unresolved = literals.unresolvedIn(entry.source);
      if (unresolved.length > 0) found.set(id, unresolved);
    }
    this._unresolvedBrains = { brains: this._brains, literals: literals.view, found };
    return found;
  }

  private readState(): BrainsViewState {
    return {
      environment: this._environment.environment,
      catalogDiagnostics: this._manifestNewer
        ? [...this._environment.diagnostics, { code: MakeCodeManifestProblemCode.FORMAT_NEWER }]
        : this._environment.diagnostics,
      brains: this._brains,
      assetLiterals: this._environment.assetLiterals.view,
      unresolvedAssets: this.unresolvedAssets(),
      brainLiterals: this._environment.brainLiterals.view,
      typeIcons: this._environment.typeIcons,
      typeLabels: this._environment.typeLabels,
      pageIcon: this._environment.pageIcon,
      packLiterals: this._environment.packLiterals,
      typePages: this._environment.typePages,
      unresolvedBrains: this.unresolvedBrains(),
      pending: this._pending,
      pushesInFlight: this._pushesInFlight,
      damaged: this._damaged,
      reconciled: this._reconciled,
    };
  }

  /** Applies the held brains to the environment's brain literals, then publishes a new snapshot to every subscriber. */
  private publish(): void {
    this._environment.brainLiterals.applyBrains(this._brains);
    this._state = this.readState();
    for (const listener of this._listeners) listener();
  }
}

/** Whether `a` and `b` are the same compiled form: both absent, or the same bytes compiled from the same source. */
function sameCompiled(a: CompiledBrain | undefined, b: CompiledBrain | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (a.sourceHash !== b.sourceHash || a.bytecode.length !== b.bytecode.length) return false;
  return a.bytecode.every((byte, index) => byte === b.bytecode[index]);
}

/** Whether `a` and `b` report the same diagnostics, code for code and message for message. */
function sameDiagnostics(a: readonly BrainBuildDiagnostic[], b: readonly BrainBuildDiagnostic[]): boolean {
  return (
    a.length === b.length &&
    a.every((diagnostic, index) => diagnostic.code === b[index]?.code && diagnostic.message === b[index]?.message)
  );
}
