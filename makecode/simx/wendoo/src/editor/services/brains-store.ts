import type { BrainDef, IBrainDef, WendooEnvironment } from "@wendoo/core/app";
import { logger } from "@wendoo/core/app";
import type { TypeId } from "@wendoo/core/runtime";
import type {
  MakeCodeAsset,
  MakeCodeBrainSummary,
  MakeCodeBrainsChannel,
  MakeCodeIdManifest,
  MakeCodeManifestReading,
  MakeCodeWireBrain,
  MakeCodeWireBrainPush,
  MakeCodeWireCompileOutcome,
  MakeCodeWireDiagnostic,
} from "@wendoo/makecode-session";
import {
  brainSourceHash,
  MakeCodeBrainsError,
  MakeCodeBrainsErrorCode,
  MakeCodeManifestProblemCode,
} from "@wendoo/makecode-session";
import type { AssetLiteral } from "../../authoring/asset-literals";
import type {
  AuthoringEnvironment,
  CatalogDiagnostic,
  PackLiteral,
  TypePage,
} from "../../authoring/authoring-environment";
import { buildAuthoringEnvironment } from "../../authoring/authoring-environment";
import type { BrainLiteral, UnresolvedBrainReference } from "../../authoring/brain-literals";
import {
  BRAIN_SOURCE_ID_MISMATCH,
  BRAIN_SOURCE_INVALID,
  checkBrainSource,
  readBrainSource,
  serializeBrainSource,
  wireDiagnostics,
} from "../../authoring/brain-source";
import { adoptIds } from "../../authoring/id-allocation";
import type { EditorSessionStore, EditorSessionViewState } from "./editor-session-store";

/**
 * The delays, in milliseconds, before each retry of a failed push of a
 * brain's latest edit or of a failed create, and before each re-run of a
 * failed reconciliation:
 * the first retry waits the first delay, each retry that fails waits the
 * next, and every retry after the last waits the last.
 */
export const PUSH_RETRY_DELAYS_MS: readonly number[] = [500, 1000, 2000, 4000, 8000];

/** The delay before retry number `attempt + 1`: {@link PUSH_RETRY_DELAYS_MS} at `attempt`, or its last delay past the end. */
function retryDelay(attempt: number): number {
  return PUSH_RETRY_DELAYS_MS[Math.min(attempt, PUSH_RETRY_DELAYS_MS.length - 1)] ?? 0;
}

/**
 * Stable code of a brain whose source places tiles the compile's environment
 * holds no tile for -- pack tiles while no catalog binds their pack. A compile
 * reading any is not a good one: the brain keeps its last good compiled form.
 */
export const BRAIN_TILE_UNRESOLVED = "BRAIN_TILE_UNRESOLVED";

/**
 * Stable code logged at warn level, once per brain per source hash, when the
 * simulator extension's compile outcome for a source differs from the
 * store's own compile of the same source: in its diagnostics' codes, its
 * unresolved tiles, or whether it produced a program.
 */
export const MAKECODE_COMPILE_MISMATCH = "MAKECODE_COMPILE_MISMATCH";

/** The prefix of the key {@link BrainsViewState.pending} holds for each brain creation awaiting its brain. */
const CREATE_KEY_PREFIX = "create/";

/**
 * Stable code of the catalog pending state, {@link BrainsViewState.catalogPending}:
 * the session has delivered no catalog.
 */
export const CATALOG_PENDING = "CATALOG_PENDING";

/** A tile a brain's source places that the store's environment holds no tile for. */
export interface UnresolvedTile {
  /** The tile's id, as the source places it. */
  readonly tileId: string;
  /** Why the tile is reported. */
  readonly code: typeof BRAIN_TILE_UNRESOLVED;
}

/** The session readings a {@link BrainsStore} follows. */
export type BrainsSessionState = Pick<EditorSessionViewState, "status" | "catalogText" | "assets">;

/**
 * The session a {@link BrainsStore} syncs its brains with the MakeCode
 * project over, and takes the project's id manifest and brains publications
 * from.
 */
export type BrainsSyncSource = Pick<EditorSessionStore, "onBrainsChannel" | "onManifest" | "onBrains">;

/** The session a {@link BrainsStore} follows, in the `useSyncExternalStore` shape: a subscribe function and a snapshot reader. */
export interface BrainsSessionSource {
  /** Subscribe to reading changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** The current reading. */
  getSnapshot(): BrainsSessionState;
}

/**
 * One brain the store holds. Its compile facts are the simulator extension's
 * once a push reply carrying its outcome for {@link source} has landed, and
 * the store's own compile's until then.
 */
export interface BrainEntry {
  /** The brain's display name, as its document carries it. */
  readonly name: string;
  /** The brain's source text: its latest applied document, serialized. */
  readonly source: string;
  /** Hash of {@link source}. */
  readonly sourceHash: string;
  /** Diagnostics of compiling {@link source}, in the order they were reported. */
  readonly diagnostics: readonly MakeCodeWireDiagnostic[];
  /**
   * The tiles {@link source} places that the compile's environment holds no
   * tile for, in the order first placed; empty when every tile resolved.
   * While any is listed, the compile is not a good one, and
   * {@link compiledSourceHash} names the last good one.
   */
  readonly unresolvedTiles: readonly UnresolvedTile[];
  /**
   * Hash of the source the brain's registration in the project was compiled
   * from -- equal to {@link sourceHash} exactly when it was compiled from
   * {@link source} -- or `null` when the project registers no compiled form
   * of the brain: as the simulator extension last reported it, in a pull, a
   * publication or a push reply, and as a good compile of the store's own
   * predicts it for an edit not answered yet.
   */
  readonly compiledSourceHash: string | null;
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
   * Ids of the brains whose latest edit -- apply, rename or removal -- the
   * MakeCode project has not answered, in the order first recorded: edits
   * made while no reconciled handshake could carry them, edits whose push is
   * in flight, and edits whose push failed. An id leaves the set when the
   * project answers a push carrying its latest edit, however late; answering
   * a push of an earlier edit leaves it pending. An id the brains do not hold
   * names a removal. Beside the ids, the set holds a key starting `create/`,
   * which names no brain, for each brain creation {@link BrainsStore.addBrain}
   * asked for whose brain the store does not hold yet.
   */
  readonly pending: ReadonlySet<string>;
  /**
   * How many pushes and creates have gone out and await the project's
   * answer: each counts from its departure until the project answers or
   * fails it, or the handshake it went out on ends, however long that takes.
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
  /**
   * `true` while the session has delivered no catalog, reported under
   * {@link CATALOG_PENDING}: every pack tile a brain places reads as
   * unresolved until the game publishes its catalog on its first frame.
   * Holds whatever the session's status and the store's {@link reconciled},
   * and is `false` from the first catalog on, a catalog once delivered being
   * kept.
   */
  readonly catalogPending: boolean;
}

/** An entry the store compiled, with what its compile found. */
interface CompiledEntry {
  /** The entry, its compile facts the store's own. */
  readonly entry: BrainEntry;
  /** What the store's own compile found, for comparing with the simulator extension's outcome. */
  readonly local: LocalCompile;
}

/** What the store's own compile of one source found, compared against the simulator extension's outcome for it. */
interface LocalCompile {
  /** Hash of the source compiled. */
  readonly sourceHash: string;
  /** The compile's diagnostic codes, in reported order. */
  readonly codes: readonly number[];
  /** The tiles the compile read as unresolved, in the order first placed. */
  readonly unresolvedTiles: readonly string[];
  /** Whether the compile was a good one: it produced a program and read every tile as resolved. */
  readonly good: boolean;
}

/** One brain creation {@link BrainsStore.addBrain} asked for, until the store holds its brain or it fails. */
interface Create {
  /** The key {@link BrainsViewState.pending} holds for it. */
  readonly key: string;
  /** Display name of the brain to create. */
  readonly name: string;
  /** Settles the creation with the created brain's document id. */
  readonly resolve: (id: string) => void;
  /** Settles the creation as failed. */
  readonly reject: (error: unknown) => void;
  /** Whether its request is in flight. */
  sending: boolean;
  /** The created brain's document id, once the project answered it. */
  id: string | undefined;
}

/**
 * The editor's brains as the UI consumes them: brain documents keyed by
 * document id, each with its compile state, compiled for live diagnostics in
 * an environment built from the followed session's catalog and the
 * project's id manifest, and rebuilt whenever a manifest arrives after a
 * different catalog or holding a different allocation. Components read
 * {@link getSnapshot} and subscribe with {@link subscribe} (both
 * `useSyncExternalStore`-shaped).
 *
 * Every document written to the store is compiled at once in the current
 * environment, and the compile's diagnostics, unresolved tiles -- recorded
 * under {@link BRAIN_TILE_UNRESOLVED} -- and the registration a good compile
 * would make are shown until the simulator extension's outcome for the same
 * source lands in a push reply; that outcome is then shown in their place.
 * An outcome that differs from the store's own compile of the same source --
 * in its diagnostics' codes, its unresolved tiles, or whether it produced a
 * program -- is logged under {@link MAKECODE_COMPILE_MISMATCH}, once per brain
 * per source hash. A document whose source text equals the source the store
 * holds for its brain changes nothing: it is not compiled, and no edit is
 * recorded.
 *
 * The environment binds the catalog's packs under the project's id
 * allocation, which the store adopts, as it is, from each manifest the sync
 * source publishes; the MakeCode side publishes one after every catalog. A
 * catalog arriving is held and builds nothing; the manifest that follows it
 * rebuilds the environment from the two. A manifest of a newer format leaves
 * every pack unbound, reported under its stable code after the catalog's
 * diagnostics. Whenever the environment is rebuilt, every brain is
 * recompiled in it for its diagnostics; nothing is pushed.
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
 * project over each makecode handshake, from the brains publications the
 * simulator extension makes. The handshake's first publication reconciles:
 * the store pulls every published brain it holds no copy of or whose copy's
 * source differs, adopts each pulled brain it holds no pending edit of,
 * drops each brain the project no longer holds that has no pending edit,
 * then pushes every pend and sends every creation asked for. Each later
 * publication refreshes the store the same way, pulling only the brains
 * holding no pending edit, and takes each published compiled source hash of
 * a source the store holds. A reconciliation whose pull fails is re-run over
 * the same handshake after each of {@link PUSH_RETRY_DELAYS_MS} in turn, and
 * then after the last of them again and again, while the session stays
 * connected and no later handshake has completed. A pulled source that is
 * not a brain document, or embeds another id, is listed in
 * {@link BrainsViewState.damaged} and never overwritten by itself, nor pulled
 * again while the project holds the same text.
 *
 * Once reconciled, each edit is pushed as it is made, carrying the brain's
 * source alone, and pending until the project answers it. A push awaits the
 * project's answer however long it takes, and fails only on a failure answer
 * or when its handshake ends. A failed push of a brain's latest edit is
 * retried, unless the brain is listed damaged, after each of
 * {@link PUSH_RETRY_DELAYS_MS} in turn and then after the last of them, again
 * and again, while the handshake it went out on stays reconciled and
 * connected; every pend is pushed when the next handshake has reconciled.
 *
 * {@link addBrain} asks the simulator extension to create a brain, which it
 * names and mints; the creation is pending until the store holds the
 * created brain. A creation is sent once a handshake has reconciled; a
 * failed one is retried as a failed push is, and one whose handshake ends
 * while it is in flight fails with `CLOSED`, the project's next publication
 * holding the brain if it was created.
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
  /** The catalog text the environment was built from. */
  private _builtCatalogText: string | undefined;
  /** The id allocation of the latest manifest published, or `undefined` before the first and under a newer format. */
  private _ids: MakeCodeIdManifest | undefined;
  /** Whether the latest manifest published is of a newer format than this editor reads. */
  private _manifestNewer = false;
  private _environment: AuthoringEnvironment;
  private _brains: ReadonlyMap<string, BrainEntry> = new Map();
  private _pending: ReadonlySet<string> = new Set();
  private _damaged: ReadonlyMap<string, BrainDamage> = new Map();
  /** The source hash of each damaged brain's source as the project held it when the damage was found. */
  private readonly _damagedHashes = new Map<string, string>();
  /** The count of edits made to each brain, by document id: a push carries the count it was made at. */
  private readonly _edits = new Map<string, number>();
  /** The store's own compile of each brain's latest source, by document id. */
  private readonly _local = new Map<string, LocalCompile>();
  /** The source hashes each brain's compile mismatch was logged for, by document id. */
  private readonly _mismatches = new Map<string, Set<string>>();
  /** The creations asked for whose brain the store does not hold yet, in the order asked. */
  private _creates: readonly Create[] = [];
  private _createCount = 0;
  /** The channel of the latest handshake, or `undefined` before the first. */
  private _channel: MakeCodeBrainsChannel | undefined;
  /** The latest brains publication of the latest handshake, or `undefined` before its first. */
  private _published: readonly MakeCodeBrainSummary[] | undefined;
  /** Whether the latest handshake's reconciliation has finished and the session has stayed connected since. */
  private _reconciled = false;
  /** Whether a reconciliation is running. */
  private _syncing = false;
  /** Whether a reconciliation is due once the running one ends. */
  private _syncDue = false;
  /** How many reconciliations over the latest handshake have failed in a row. */
  private _syncFailures = 0;
  /** The scheduled retry of each brain whose latest push failed, by document id. */
  private readonly _retries = new Map<string, ReturnType<typeof setTimeout>>();
  private _pushesInFlight = 0;
  private _state: BrainsViewState;

  /**
   * @param session - The session whose catalog the environment is built from, and whose connectivity decides which edits pend.
   * @param sync - The session the brains are synced with the MakeCode project over, and the project's id manifest and brains are taken from. When omitted, the store syncs nothing, binds no pack, builds its environment from the catalog the session holds now, pends every edit made while the session is not connected, and creates no brain.
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
    sync?.onManifest((reading) => {
      this.adoptManifest(reading);
    });
    sync?.onBrains((brains) => {
      this.brainsPublished(brains);
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
   * Asks the simulator extension to create an empty one-page brain named
   * `name`, pending until the store holds it: sent at once while the store is
   * reconciled, else once the next handshake has reconciled. Resolves with
   * the created brain's document id once the store holds the brain; rejects
   * with a `MakeCodeBrainsError` carrying `CLOSED` when the handshake carrying
   * the request ends before its answer. With no sync source it never settles.
   *
   * @param name - Display name of the brain; any text, including empty or one another brain carries.
   */
  addBrain(name: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const create: Create = {
        key: `${CREATE_KEY_PREFIX}${++this._createCount}`,
        name,
        resolve,
        reject,
        sending: false,
        id: undefined,
      };
      this._creates = [...this._creates, create];
      this.publish();
      const channel = this._channel;
      if (channel !== undefined && this.pushesOver(channel)) this.sendCreate(channel, create);
    });
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
    this._local.delete(id);
    this.edited(id);
    this.publish();
  }

  /**
   * Pushes the store's copy of the brain `id` to the MakeCode project over
   * the damaged source the project holds, clearing the damage once the
   * project answers it. Does nothing unless the brain is listed damaged, the
   * store holds it, and the store is reconciled
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
    const { entry, local } = this.compiled(definition.name(), source, held?.compiledSourceHash ?? null);
    this._brains = new Map(this._brains).set(id, entry);
    this._local.set(id, local);
    this.edited(id);
    this.publish();
  }

  /**
   * The entry holding `source`, a brain named `name`, compiled in the
   * current environment, with what the compile found: `compiledSourceHash`
   * is the source's hash for a good compile and `registered` otherwise.
   * Throws when `source` is not a brain document.
   */
  private compiled(name: string, source: string, registered: string | null): CompiledEntry {
    this._environment.assetLiterals.bindSource(source);
    this._environment.brainLiterals.bindSource(source);
    const sourceHash = brainSourceHash(source);
    const compile = checkBrainSource(this._environment.environment, source);
    const good = compile.linked && compile.unresolvedTiles.length === 0;
    const diagnostics = wireDiagnostics(compile.diagnostics);
    return {
      entry: {
        name,
        source,
        sourceHash,
        diagnostics,
        unresolvedTiles: unresolvedTilesOf(compile.unresolvedTiles),
        compiledSourceHash: good ? sourceHash : registered,
      },
      local: {
        sourceHash,
        codes: diagnostics.map((diagnostic) => diagnostic.code),
        unresolvedTiles: compile.unresolvedTiles,
        good,
      },
    };
  }

  /**
   * Records an edit of the brain `id` pending, and pushes it when a
   * connected handshake has reconciled and the brain is not damaged. With no
   * sync source, records it pending only when the session is not connected.
   */
  private edited(id: string): void {
    this._edits.set(id, (this._edits.get(id) ?? 0) + 1);
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
  private reconcilesOver(channel: MakeCodeBrainsChannel): boolean {
    return this._channel === channel && this._session.getSnapshot().status === "connected";
  }

  /** Whether edits reach the project over `channel` now: it is the latest handshake's, reconciled, and the session is connected. */
  private pushesOver(channel: MakeCodeBrainsChannel): boolean {
    return this._channel === channel && this._reconciled && this._session.getSnapshot().status === "connected";
  }

  /**
   * Pushes the store's latest state of the brain `id` over `channel`: its
   * source, or its removal when the store holds none. Records the brain
   * pending, counts the push in flight until the project answers it or the
   * handshake `channel` belongs to ends, however long that takes, and cancels
   * any retry scheduled for the brain.
   *
   * @param attempt - How many failed pushes of the same state precede this one: 0 for a first push.
   */
  private push(channel: MakeCodeBrainsChannel, id: string, attempt = 0): void {
    clearTimeout(this._retries.get(id));
    this._retries.delete(id);
    const entry = this._brains.get(id);
    const edit = this._edits.get(id) ?? 0;
    const push: MakeCodeWireBrainPush =
      entry === undefined
        ? { op: "remove", brainId: id }
        : { op: "write", brain: { id, name: entry.name, source: entry.source } };
    this.recordPending(id);
    this._pushesInFlight += 1;
    this.publish();
    channel.pushBrain(push).then(
      (outcome) => {
        this._pushesInFlight -= 1;
        this.pushAnswered(id, edit, outcome);
      },
      () => {
        this._pushesInFlight -= 1;
        this.pushFailed(channel, id, edit, attempt);
      }
    );
  }

  /**
   * Takes the project's answer to a push of the brain `id` made at its edit
   * count `edit`: shows `outcome` when it is the outcome for the brain's
   * current source, clears the brain's damage, and clears its pend,
   * cancelling any scheduled retry, when `edit` is still its latest edit.
   * Publishes.
   */
  private pushAnswered(id: string, edit: number, outcome: MakeCodeWireCompileOutcome | null): void {
    if (this._pending.has(id) && this._edits.get(id) === edit) {
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
      this._damagedHashes.delete(id);
    }
    if (outcome !== null) this.adoptOutcome(id, outcome);
    this.publish();
  }

  /**
   * Takes the simulator extension's `outcome` for a source of the brain
   * `id`: logs {@link MAKECODE_COMPILE_MISMATCH} once per source hash when it
   * differs from the store's own compile of that source, and shows it when
   * the brain's current source is that source.
   */
  private adoptOutcome(id: string, outcome: MakeCodeWireCompileOutcome): void {
    const local = this._local.get(id);
    const logged = this._mismatches.get(id) ?? new Set<string>();
    if (local?.sourceHash === outcome.sourceHash && !logged.has(outcome.sourceHash) && !sameCompile(local, outcome)) {
      this._mismatches.set(id, logged.add(outcome.sourceHash));
      logger.warn(MAKECODE_COMPILE_MISMATCH, { brainId: id, sourceHash: outcome.sourceHash });
    }
    const entry = this._brains.get(id);
    if (entry?.sourceHash !== outcome.sourceHash) return;
    this._brains = new Map(this._brains).set(id, {
      ...entry,
      diagnostics: outcome.diagnostics,
      unresolvedTiles: unresolvedTilesOf(outcome.unresolvedTiles),
      compiledSourceHash: outcome.compiled?.sourceHash ?? null,
    });
  }

  /**
   * Handles the failure of the push over `channel` of the brain `id` made at
   * its edit count `edit`, and publishes. When `edit` is still the brain's
   * latest edit, the brain is not damaged, and edits reach the project over
   * `channel`, retries the push after the delay {@link PUSH_RETRY_DELAYS_MS}
   * holds at `attempt`, or its last delay past the end, provided edits still
   * reach the project over `channel` then.
   */
  private pushFailed(channel: MakeCodeBrainsChannel, id: string, edit: number, attempt: number): void {
    this.publish();
    if (this._edits.get(id) !== edit || this._damaged.has(id) || !this.pushesOver(channel)) return;
    const retry = setTimeout(() => {
      this._retries.delete(id);
      if (this.pushesOver(channel)) this.push(channel, id, attempt + 1);
    }, retryDelay(attempt));
    this._retries.set(id, retry);
  }

  /**
   * Sends `create` over `channel`, counting it in flight until the project
   * answers it or the handshake ends, then takes the created brain.
   *
   * @param attempt - How many failed sends of the creation precede this one: 0 for a first send.
   */
  private sendCreate(channel: MakeCodeBrainsChannel, create: Create, attempt = 0): void {
    create.sending = true;
    this._pushesInFlight += 1;
    this.publish();
    channel.createBrain(create.name).then(
      (brain) => {
        this._pushesInFlight -= 1;
        create.sending = false;
        create.id = brain.id;
        this.publish();
        if (!this.settleCreates()) void this.pullCreated(channel, brain.id);
      },
      (error: unknown) => {
        this._pushesInFlight -= 1;
        create.sending = false;
        if (error instanceof MakeCodeBrainsError && error.code === MakeCodeBrainsErrorCode.CLOSED) {
          this._creates = this._creates.filter((held) => held !== create);
          this.publish();
          create.reject(error);
          return;
        }
        this.publish();
        if (!this.pushesOver(channel)) return;
        setTimeout(() => {
          if (this.pushesOver(channel) && this._creates.includes(create) && !create.sending) {
            this.sendCreate(channel, create, attempt + 1);
          }
        }, retryDelay(attempt));
      }
    );
  }

  /**
   * Pulls the brain `id` a creation made over `channel` and holds it; a pull
   * that fails leaves the brain to the next reconciliation.
   */
  private async pullCreated(channel: MakeCodeBrainsChannel, id: string): Promise<void> {
    let pulled: MakeCodeWireBrain[];
    try {
      pulled = await channel.pullBrains([id]);
    } catch {
      return;
    }
    if (this._channel !== channel || this._brains.has(id) || this._pending.has(id)) return;
    const brain = pulled.find((held) => held.id === id);
    if (brain === undefined) return;
    const read = this.readPulled(brain);
    if (typeof read === "string") return;
    this._brains = new Map(this._brains).set(id, read.entry);
    this._local.set(id, read.local);
    this.settleCreates();
    this.publish();
  }

  /**
   * Resolves every creation whose brain the store now holds, removing it
   * from the creations. Returns whether any resolved; publishes nothing.
   */
  private settleCreates(): boolean {
    const done = this._creates.filter((create) => create.id !== undefined && this._brains.has(create.id));
    if (done.length === 0) return false;
    this._creates = this._creates.filter((create) => !done.includes(create));
    for (const create of done) create.resolve(create.id as string);
    return true;
  }

  /** Pushes every pending brain that is not damaged, and sends every creation not sent, over `channel`. */
  private flush(channel: MakeCodeBrainsChannel): void {
    for (const id of this._pending) {
      if (!this._damaged.has(id)) this.push(channel, id);
    }
    for (const create of this._creates) {
      if (!create.sending && create.id === undefined) this.sendCreate(channel, create);
    }
  }

  /** Adopts `channel` as the latest handshake's, to reconcile over once the handshake delivers its first brains publication. */
  private handshakeCompleted(channel: MakeCodeBrainsChannel): void {
    const wasReconciled = this._reconciled;
    this._channel = channel;
    this._published = undefined;
    this._reconciled = false;
    this._syncFailures = 0;
    if (wasReconciled) this.publish();
  }

  /** Takes `brains` as the latest handshake's latest brains publication, and reconciles with it. */
  private brainsPublished(brains: readonly MakeCodeBrainSummary[]): void {
    if (this._channel === undefined) return;
    this._published = brains;
    this.requestSync();
  }

  /** Reconciles with the latest publication once any running reconciliation ends. */
  private requestSync(): void {
    this._syncDue = true;
    if (!this._syncing) void this.runSync();
  }

  /**
   * Runs reconciliations with the latest publication until none is due. A
   * failed one is re-run after the delay {@link PUSH_RETRY_DELAYS_MS} holds at
   * the count of failures in a row, or its last delay past the end, while the
   * session stays connected and its handshake is the latest.
   */
  private async runSync(): Promise<void> {
    this._syncing = true;
    try {
      while (this._syncDue) {
        this._syncDue = false;
        const channel = this._channel;
        const brains = this._published;
        if (channel === undefined || brains === undefined) continue;
        if (await this.reconcile(channel, brains)) {
          this._syncFailures = 0;
          continue;
        }
        if (!this.reconcilesOver(channel)) continue;
        const delay = retryDelay(this._syncFailures);
        this._syncFailures += 1;
        setTimeout(() => {
          if (this.reconcilesOver(channel)) this.requestSync();
        }, delay);
      }
    } finally {
      this._syncing = false;
    }
  }

  /**
   * Brings the store into step with the publication `brains` over
   * `channel`: pulls what differs, adopts or records it, drops what the
   * project no longer holds, and takes the published compiled source hashes;
   * on the handshake's first, then pushes the pends and sends the creations.
   * A brain pending when the run starts or when its pull answers is neither
   * adopted nor dropped. Resolves `false` when the pull fails, and `true`
   * otherwise, abandoning the run when a later handshake takes over.
   */
  private async reconcile(channel: MakeCodeBrainsChannel, brains: readonly MakeCodeBrainSummary[]): Promise<boolean> {
    const first = !this._reconciled;
    const pendingAtStart = this._pending;
    const pending = (id: string): boolean => pendingAtStart.has(id) || this._pending.has(id);
    const wanted = brains.filter((summary) => this.wantsPull(summary, first)).map((summary) => summary.id);
    let pulled: MakeCodeWireBrain[];
    try {
      pulled = wanted.length === 0 ? [] : await channel.pullBrains(wanted);
    } catch {
      return false;
    }
    if (this._channel !== channel) return true;

    const entries = new Map(this._brains);
    const damaged = new Map(this._damaged);
    for (const brain of pulled) {
      const read = this.readPulled(brain);
      if (typeof read === "string") {
        damaged.set(brain.id, { code: read, name: brain.name });
        this._damagedHashes.set(brain.id, brainSourceHash(brain.source));
        continue;
      }
      damaged.delete(brain.id);
      this._damagedHashes.delete(brain.id);
      if (pending(brain.id)) continue;
      entries.set(brain.id, read.entry);
      this._local.set(brain.id, read.local);
    }
    const held = new Set(brains.map((summary) => summary.id));
    const pulledIds = new Set(pulled.map((brain) => brain.id));
    for (const id of wanted) {
      if (!pulledIds.has(id)) held.delete(id);
    }
    for (const id of this._brains.keys()) {
      if (!held.has(id) && !pending(id)) {
        entries.delete(id);
        this._local.delete(id);
      }
    }
    for (const id of this._damaged.keys()) {
      if (!held.has(id)) {
        damaged.delete(id);
        this._damagedHashes.delete(id);
      }
    }
    for (const summary of brains) {
      const entry = entries.get(summary.id);
      if (entry?.sourceHash === summary.sourceHash && entry.compiledSourceHash !== summary.compiledSourceHash) {
        entries.set(summary.id, { ...entry, compiledSourceHash: summary.compiledSourceHash });
      }
    }
    this._brains = entries;
    this._damaged = damaged;
    this._reconciled = true;
    this.settleCreates();
    this.publish();
    if (first) this.flush(channel);
    return true;
  }

  /**
   * Whether a reconciliation pulls the published brain: the store holds no
   * copy of it or its copy's source differs, it holds no pending edit of it
   * unless this is the handshake's first reconciliation, and the project's
   * source is not the damaged text it held when its damage was found.
   */
  private wantsPull(summary: MakeCodeBrainSummary, first: boolean): boolean {
    if (this._brains.get(summary.id)?.sourceHash === summary.sourceHash) return false;
    if (!first && this._pending.has(summary.id)) return false;
    return this._damagedHashes.get(summary.id) !== summary.sourceHash;
  }

  /**
   * Reads a pulled brain in the current environment: its damage when its
   * source is not a brain document or embeds a different id, and otherwise
   * the entry holding it, compiled at once, with the compiled source hash
   * the project reports.
   */
  private readPulled(brain: MakeCodeWireBrain): BrainDamageCode | CompiledEntry {
    this._environment.assetLiterals.bindSource(brain.source);
    this._environment.brainLiterals.bindSource(brain.source);
    let definition: BrainDef;
    try {
      definition = readBrainSource(this._environment.environment, brain.source);
    } catch {
      return BRAIN_SOURCE_INVALID;
    }
    if (definition.id() !== brain.id) return BRAIN_SOURCE_ID_MISMATCH;
    let compiled: CompiledEntry;
    try {
      compiled = this.compiled(definition.name(), brain.source, null);
    } catch {
      return BRAIN_SOURCE_INVALID;
    }
    return { ...compiled, entry: { ...compiled.entry, compiledSourceHash: brain.compiledSourceHash } };
  }

  /**
   * Adopts the project's manifest as `reading` reports it: a manifest of a
   * newer format leaves the store holding no allocation, and any other its
   * allocation, an absent one allocating nothing. Rebuilds the environment
   * when the allocation or the catalog changed since it was built, and
   * publishes when anything changed.
   */
  private adoptManifest(reading: MakeCodeManifestReading): void {
    const newer = reading.problem === MakeCodeManifestProblemCode.FORMAT_NEWER;
    const { ids, changed } = adoptIds(reading, this._ids);
    const newerChanged = newer !== this._manifestNewer;
    this._ids = ids;
    this._manifestNewer = newer;
    if (changed || this._catalogText !== this._builtCatalogText) {
      this.rebuild();
    } else if (!newerChanged) {
      return;
    }
    this.publish();
  }

  /**
   * Rebuilds the environment from the session's catalog and the allocation
   * held, then recompiles every brain in it for its diagnostics and
   * unresolved tiles, keeping each brain's compiled source hash.
   */
  private rebuild(): void {
    this._environment = this.buildEnvironment();
    const brains = new Map(this._brains);
    for (const [id, held] of this._brains) {
      let entry: BrainEntry;
      try {
        const compiled = this.compiled(held.name, held.source, held.compiledSourceHash);
        entry = compiled.entry;
        this._local.set(id, compiled.local);
      } catch {
        continue;
      }
      if (
        sameDiagnostics(entry.diagnostics, held.diagnostics) &&
        sameUnresolvedTiles(entry.unresolvedTiles, held.unresolvedTiles)
      ) {
        continue;
      }
      brains.set(id, { ...held, diagnostics: entry.diagnostics, unresolvedTiles: entry.unresolvedTiles });
    }
    this._brains = brains;
  }

  /**
   * The environment for the session's catalog and the allocation held, its
   * asset literals following the held asset snapshot and bound for every
   * held brain's source.
   */
  private buildEnvironment(): AuthoringEnvironment {
    this._builtCatalogText = this._catalogText;
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
   * Ends the reconciled state when the session is no longer connected, holds
   * a different catalog for the next manifest to build from, and applies a
   * different asset snapshot to the environment's asset literals in place;
   * publishes when any of them changed.
   */
  private sessionChanged(): void {
    const { status, catalogText, assets } = this._session.getSnapshot();
    const unreconciled = this._reconciled && status !== "connected";
    if (unreconciled) this._reconciled = false;
    const catalogChanged = catalogText !== this._catalogText;
    this._catalogText = catalogText;
    const assetsChanged = assets !== this._assets;
    this._assets = assets;
    if (assetsChanged) this._environment.assetLiterals.applySnapshot(assets);
    if (unreconciled || catalogChanged || assetsChanged) this.publish();
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

  /** The pends: the pending brain ids, then the key of each creation awaiting its brain. */
  private pendingView(): ReadonlySet<string> {
    if (this._creates.length === 0) return this._pending;
    return new Set([...this._pending, ...this._creates.map((create) => create.key)]);
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
      pending: this.pendingView(),
      pushesInFlight: this._pushesInFlight,
      damaged: this._damaged,
      reconciled: this._reconciled,
      catalogPending: this._catalogText === undefined,
    };
  }

  /** Applies the held brains to the environment's brain literals, then publishes a new snapshot to every subscriber. */
  private publish(): void {
    this._environment.brainLiterals.applyBrains(this._brains);
    this._state = this.readState();
    for (const listener of this._listeners) listener();
  }
}

/** `tileIds` as unresolved tiles, each under {@link BRAIN_TILE_UNRESOLVED}. */
function unresolvedTilesOf(tileIds: readonly string[]): readonly UnresolvedTile[] {
  return tileIds.map((tileId) => ({ tileId, code: BRAIN_TILE_UNRESOLVED }));
}

/** Whether `a` and `b` list the same tiles, in the same order. */
function sameUnresolvedTiles(a: readonly UnresolvedTile[], b: readonly UnresolvedTile[]): boolean {
  return a.length === b.length && a.every((tile, index) => tile.tileId === b[index]?.tileId);
}

/** Whether `a` and `b` report the same diagnostics, code for code and message for message. */
function sameDiagnostics(a: readonly MakeCodeWireDiagnostic[], b: readonly MakeCodeWireDiagnostic[]): boolean {
  return (
    a.length === b.length &&
    a.every((diagnostic, index) => diagnostic.code === b[index]?.code && diagnostic.message === b[index]?.message)
  );
}

/**
 * Whether the store's own compile `local` and the simulator extension's
 * `outcome` of the same source agree: the same diagnostic codes in the same
 * order, the same unresolved tiles, and both good compiles or neither -- the
 * outcome's a good one when the registration it reports was compiled from
 * its source.
 */
function sameCompile(local: LocalCompile, outcome: MakeCodeWireCompileOutcome): boolean {
  return (
    local.good === (outcome.compiled?.sourceHash === outcome.sourceHash) &&
    local.codes.length === outcome.diagnostics.length &&
    local.codes.every((code, index) => code === outcome.diagnostics[index]?.code) &&
    local.unresolvedTiles.length === outcome.unresolvedTiles.length &&
    local.unresolvedTiles.every((tileId, index) => tileId === outcome.unresolvedTiles[index])
  );
}
