import type { IBrainDef, WendooEnvironment } from "@wendoo/core/app";
import { BrainDef } from "@wendoo/core/app";
import type { BrainBuildDiagnostic } from "@wendoo/core/brain";
import type { MakeCodeBrain, MakeCodeBrainPush, MakeCodeBrainSummary } from "@wendoo/makecode-session";
import { brainSourceHash } from "@wendoo/makecode-session";
import type { AuthoringEnvironment, CatalogDiagnostic } from "./authoring-environment";
import { buildAuthoringEnvironment } from "./authoring-environment";
import type { BrainSourceCompile } from "./brain-source";
import {
  BRAIN_SOURCE_ID_MISMATCH,
  BRAIN_SOURCE_INVALID,
  compileBrainSource,
  readBrainSource,
  serializeBrainSource,
} from "./brain-source";
import type { EditorBrainsChannel, EditorSessionStore, EditorSessionViewState } from "./editor-session-store";

/** The session readings a {@link BrainsStore} follows. */
export type BrainsSessionState = Pick<EditorSessionViewState, "status" | "catalogText">;

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

/** What the editor reads from the brains store. */
export interface BrainsViewState {
  /** The environment built from the session's latest catalog, for reading, editing and compiling brains. */
  readonly environment: WendooEnvironment;
  /** Problems found in the session's latest catalog, in catalog order. */
  readonly catalogDiagnostics: readonly CatalogDiagnostic[];
  /** The brains, keyed by document id, in the order they were first stored. */
  readonly brains: ReadonlyMap<string, BrainEntry>;
  /**
   * Ids of the brains whose latest edit -- add, apply, rename or removal --
   * the MakeCode project has not acknowledged, in the order first recorded:
   * edits made while no reconciled handshake could carry them, and edits
   * whose push failed. Each is pushed when the next handshake has
   * reconciled, and leaves the set when the project acknowledges a push of
   * its latest edit. An id the brains do not hold names a removal.
   */
  readonly pending: ReadonlySet<string>;
  /**
   * Brains whose source in the MakeCode project is damaged, keyed by
   * document id, each with the code of its damage: found on a pull, and
   * cleared when a later reconciliation finds the source repaired or gone,
   * or when the project acknowledges a push of the brain. The store never pushes a damaged brain by itself, and edits to
   * one stay pending; when {@link brains} holds the brain,
   * {@link BrainsStore.repushBrain} restores the project from that copy.
   */
  readonly damaged: ReadonlyMap<string, BrainDamageCode>;
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
 * diagnostics, beside the last good compile.
 *
 * Given a sync source, the store keeps its brains in step with the MakeCode
 * project over each makecode handshake. When a handshake completes, the
 * store reconciles: a handshake of a different binding than the previous
 * one first replaces the brains, discarding every local brain and pend; it
 * lists the project's brains, pulls those whose source differs from the
 * store's, adopts each pulled brain it holds no pending edit of, drops
 * each brain the project no longer holds that has no pending edit, then
 * pushes every pend. A pulled source that is not a brain document is listed
 * in {@link BrainsViewState.damaged} and never overwritten by itself; a
 * pulled source whose compiled form was not compiled from it is recompiled
 * and, when that compile succeeds, pushed. Once reconciled, each edit is
 * pushed as it is made. A push carries the brain as the store holds it: its
 * source and the compiled form and hash of one compile.
 */
export class BrainsStore {
  private readonly _session: BrainsSessionSource;
  private readonly _sync: BrainsSyncSource | undefined;
  private readonly _listeners = new Set<() => void>();
  private _catalogText: string | undefined;
  private _environment: AuthoringEnvironment;
  private _brains: ReadonlyMap<string, BrainEntry> = new Map();
  private _pending: ReadonlySet<string> = new Set();
  private _damaged: ReadonlyMap<string, BrainDamageCode> = new Map();
  /** The channel of the latest handshake, or `undefined` before the first. */
  private _channel: EditorBrainsChannel | undefined;
  /** Whether the latest handshake's reconciliation has finished. */
  private _reconciled = false;
  private _state: BrainsViewState;

  /**
   * @param session - The session whose catalog the environment is built from, and whose connectivity decides which edits pend.
   * @param sync - The session the brains are synced with the MakeCode project over. When omitted, the store syncs nothing and pends every edit made while the session is not connected.
   */
  constructor(session: BrainsSessionSource, sync?: BrainsSyncSource) {
    this._session = session;
    this._sync = sync;
    this._catalogText = session.getSnapshot().catalogText;
    this._environment = buildAuthoringEnvironment(this._catalogText);
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
   * damaged, the store holds it, and a handshake has reconciled.
   *
   * @param id - Document id of the brain.
   */
  repushBrain(id: string): void {
    const channel = this._channel;
    if (!this._damaged.has(id) || !this._brains.has(id) || channel === undefined || !this._reconciled) return;
    this.push(channel, id);
  }

  /** Serializes, compiles and stores `definition`, then records the edit. */
  private store(definition: IBrainDef): void {
    const id = definition.id();
    const source = serializeBrainSource(definition);
    const sourceHash = brainSourceHash(source);
    const compile = compileBrainSource(this._environment.environment, source);
    const entry: BrainEntry = {
      name: definition.name(),
      source,
      sourceHash,
      diagnostics: compile.diagnostics,
      compiled:
        compile.bytecode === undefined ? this._brains.get(id)?.compiled : { bytecode: compile.bytecode, sourceHash },
    };
    this._brains = new Map(this._brains).set(id, entry);
    this.edited(id);
    this.publish();
  }

  /**
   * Records an edit of the brain `id`: pushes it when a connected handshake
   * has reconciled and the brain is not damaged, and records it pending
   * otherwise. With no sync source, records it pending when the session is
   * not connected.
   */
  private edited(id: string): void {
    const connected = this._session.getSnapshot().status === "connected";
    if (this._sync === undefined) {
      if (!connected) this._pending = new Set(this._pending).add(id);
      return;
    }
    const channel = this._channel;
    if (connected && channel !== undefined && this._reconciled && !this._damaged.has(id)) {
      this.push(channel, id);
      return;
    }
    this._pending = new Set(this._pending).add(id);
  }

  /** Pushes the store's latest state of the brain `id` over `channel`: its entry, or its removal when the store holds none. */
  private push(channel: EditorBrainsChannel, id: string): void {
    const entry = this._brains.get(id);
    const push: MakeCodeBrainPush =
      entry === undefined
        ? { op: "remove", brainId: id }
        : { op: "write", brain: { id, name: entry.name, source: entry.source, compiled: entry.compiled } };
    channel.pushBrain(push).then(
      () => {
        this.pushAcknowledged(id);
      },
      () => {
        this._pending = new Set(this._pending).add(id);
        this.publish();
      }
    );
  }

  /** Clears the pend and the damage of the brain `id`, whose push the project acknowledged. */
  private pushAcknowledged(id: string): void {
    if (!this._pending.has(id) && !this._damaged.has(id)) return;
    const pending = new Set(this._pending);
    pending.delete(id);
    this._pending = pending;
    const damaged = new Map(this._damaged);
    damaged.delete(id);
    this._damaged = damaged;
    this.publish();
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
    this._channel = channel;
    this._reconciled = false;
    if (previous !== undefined && previous.binding !== channel.binding) {
      this._brains = new Map();
      this._pending = new Set();
      this._damaged = new Map();
      this.publish();
    }
    void this.reconcile(channel);
  }

  /**
   * Brings the store and the project into step over `channel`: lists, pulls
   * what differs, adopts or records it, drops what the project no longer
   * holds, then pushes the pends and the recompiled brains. Abandoned when
   * a request fails or a later handshake takes over; the next handshake
   * reconciles again.
   */
  private async reconcile(channel: EditorBrainsChannel): Promise<void> {
    let listed: MakeCodeBrainSummary[];
    let wanted: string[];
    let pulled: MakeCodeBrain[];
    try {
      listed = await channel.listBrains();
      if (this._channel !== channel) return;
      wanted = listed.filter((summary) => this.wantsPull(summary)).map((summary) => summary.id);
      pulled = wanted.length === 0 ? [] : await channel.pullBrains(wanted);
    } catch {
      return;
    }
    if (this._channel !== channel) return;

    const brains = new Map(this._brains);
    const damaged = new Map(this._damaged);
    const recompiled: string[] = [];
    for (const brain of pulled) {
      const read = this.readPulled(brain);
      if (typeof read === "string") {
        damaged.set(brain.id, read);
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

  /** Whether a reconciliation pulls the listed brain: the store holds no copy of it, or its copy's source differs. */
  private wantsPull(summary: MakeCodeBrainSummary): boolean {
    return this._brains.get(summary.id)?.sourceHash !== summary.sourceHash;
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
    return { entry, recompiled: compile.bytecode !== undefined && brain.compiled?.sourceHash !== sourceHash };
  }

  /** Rebuilds the environment when the session carries a different catalog, then publishes. */
  private sessionChanged(): void {
    const catalogText = this._session.getSnapshot().catalogText;
    if (catalogText === this._catalogText) return;
    this._catalogText = catalogText;
    this._environment = buildAuthoringEnvironment(catalogText);
    this.publish();
  }

  private readState(): BrainsViewState {
    return {
      environment: this._environment.environment,
      catalogDiagnostics: this._environment.diagnostics,
      brains: this._brains,
      pending: this._pending,
      damaged: this._damaged,
    };
  }

  /** Publishes a new snapshot to every subscriber. */
  private publish(): void {
    this._state = this.readState();
    for (const listener of this._listeners) listener();
  }
}
