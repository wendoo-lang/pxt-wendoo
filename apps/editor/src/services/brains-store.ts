import type { IBrainDef, WendooEnvironment } from "@wendoo/core/app";
import { BrainDef } from "@wendoo/core/app";
import type { BrainBuildDiagnostic } from "@wendoo/core/brain";
import type { AuthoringEnvironment, CatalogDiagnostic } from "./authoring-environment";
import { buildAuthoringEnvironment } from "./authoring-environment";
import { brainSourceHash, compileBrainSource, readBrainSource, serializeBrainSource } from "./brain-source";
import type { EditorSessionViewState } from "./editor-session-store";

/** The session readings a {@link BrainsStore} follows. */
export type BrainsSessionState = Pick<EditorSessionViewState, "status" | "catalogText">;

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

/** What the editor reads from the brains store. */
export interface BrainsViewState {
  /** The environment built from the session's latest catalog, for reading, editing and compiling brains. */
  readonly environment: WendooEnvironment;
  /** Problems found in the session's latest catalog, in catalog order. */
  readonly catalogDiagnostics: readonly CatalogDiagnostic[];
  /** The brains, keyed by document id, in the order they were first stored. */
  readonly brains: ReadonlyMap<string, BrainEntry>;
  /**
   * Ids of the brains added, applied, renamed or removed while the session
   * was not connected, in the order first recorded. An id the brains do not
   * hold names a removal.
   */
  readonly pending: ReadonlySet<string>;
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
 */
export class BrainsStore {
  private readonly _session: BrainsSessionSource;
  private readonly _listeners = new Set<() => void>();
  private _catalogText: string | undefined;
  private _environment: AuthoringEnvironment;
  private _brains: ReadonlyMap<string, BrainEntry> = new Map();
  private _pending: ReadonlySet<string> = new Set();
  private _state: BrainsViewState;

  /**
   * @param session - The session whose catalog the environment is built from, and whose connectivity decides which edits pend.
   */
  constructor(session: BrainsSessionSource) {
    this._session = session;
    this._catalogText = session.getSnapshot().catalogText;
    this._environment = buildAuthoringEnvironment(this._catalogText);
    this._state = this.readState();
    session.subscribe(() => {
      this.sessionChanged();
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
    this.recordEdit(id);
    this.publish();
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
    this.recordEdit(id);
    this.publish();
  }

  /** Records the brain `id` as pending when the session is not connected. */
  private recordEdit(id: string): void {
    if (this._session.getSnapshot().status === "connected") return;
    this._pending = new Set(this._pending).add(id);
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
    };
  }

  /** Publishes a new snapshot to every subscriber. */
  private publish(): void {
    this._state = this.readState();
    for (const listener of this._listeners) listener();
  }
}
