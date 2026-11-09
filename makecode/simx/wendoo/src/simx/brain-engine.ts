import type { WendooEnvironment } from "@wendoo/core/app";
import { BrainDef } from "@wendoo/core/app";
import type {
  MakeCodeAsset,
  MakeCodeIdManifest,
  MakeCodeManifestReading,
  MakeCodeWireCompileOutcome,
} from "@wendoo/makecode-session";
import { brainSourceHash } from "@wendoo/makecode-session";
import { type AuthoringEnvironment, buildAuthoringEnvironment } from "../authoring/authoring-environment.js";
import {
  type BrainSourceCompile,
  compileBrainSource,
  readBrainSource,
  serializeBrainSource,
  wireDiagnostics,
} from "../authoring/brain-source.js";
import { adoptIds } from "../authoring/id-allocation.js";
import type { CompiledBrain } from "./brains-module.js";

/** What compiling one brain source made, with the registration the convergence rule leaves the brain. */
export interface EngineCompile {
  /** The compile's outcome, as a push's reply carries it. */
  readonly outcome: MakeCodeWireCompileOutcome;
  /**
   * The brain's registration once the compile is applied: this compile's
   * program when it produced one with every tile resolved, else the
   * registration the brain held before it under the brain's name, or
   * `undefined` when it held none.
   */
  readonly registration: CompiledBrain | undefined;
}

/** An empty brain document the engine minted, as its source text. */
export interface MintedBrain {
  /** The brain's document id, minted by the environment's brain services. */
  readonly id: string;
  /** The brain's source text, as the editor serializes a brain document. */
  readonly source: string;
}

/**
 * The simulator extension's brain compile environment: built with
 * `buildAuthoringEnvironment` from the latest catalog text and the project's
 * id manifest, its asset literals following the latest asset snapshot and
 * its brain literals the project's brains. Before any catalog it is
 * core-only, so pack tiles a brain places compile as unresolved.
 *
 * {@link adoptCatalog}, {@link adoptManifest} and {@link adoptAssets} take a
 * new input and report whether it changed what the environment is built
 * from; each change rebuilds it.
 */
export class BrainEngine {
  private _catalogText: string | undefined;
  /** The id allocation the packs bind under, or `undefined` before any manifest and under a newer format. */
  private _ids: MakeCodeIdManifest | undefined;
  private _assets: readonly MakeCodeAsset[] | undefined;
  private _built: AuthoringEnvironment;

  constructor() {
    this._built = this.build();
  }

  /** The environment brains are compiled in. */
  get environment(): WendooEnvironment {
    return this._built.environment;
  }

  /**
   * Take `catalogText` as the latest catalog and `reading` as the manifest
   * allocating it, rebuilding the environment when either changed. Returns
   * whether it rebuilt.
   *
   * @param catalogText - The catalog's serialized text, as published to the editor.
   * @param reading - The project's id manifest once the catalog is allocated.
   */
  adoptCatalog(catalogText: string, reading: MakeCodeManifestReading): boolean {
    const idsChanged = this.takeManifest(reading);
    if (catalogText === this._catalogText && !idsChanged) return false;
    this._catalogText = catalogText;
    this._built = this.build();
    return true;
  }

  /**
   * Take `reading` as the project's id manifest, rebuilding the environment
   * when its allocation changed. Returns whether it rebuilt.
   *
   * @param reading - The project's id manifest, as the frame holds it.
   */
  adoptManifest(reading: MakeCodeManifestReading): boolean {
    if (!this.takeManifest(reading)) return false;
    this._built = this.build();
    return true;
  }

  /**
   * Take `assets` as the latest asset snapshot, rebuilding the environment
   * when it is another snapshot. Returns whether it rebuilt.
   *
   * @param assets - The project's asset snapshot.
   */
  adoptAssets(assets: readonly MakeCodeAsset[]): boolean {
    if (assets === this._assets) return false;
    this._assets = assets;
    this._built = this.build();
    return true;
  }

  /**
   * Compile `source`, the brain `id` named `name`, and apply the convergence
   * rule over `held`: a compile producing a program with every tile resolved
   * registers it, and any other keeps `held`, under `name`. Binds the
   * literals the source references and takes `names` as the project's brains
   * before compiling. A source that is not a brain document compiles to
   * nothing: no diagnostic, no unresolved tile, and `held` kept. Throws when
   * compiling, linking or encoding a brain document throws.
   *
   * @param id - The brain's document id.
   * @param name - The brain's display name, as its registration carries it.
   * @param source - The brain's source text.
   * @param held - The brain's registration before this compile, or `undefined` for none.
   * @param names - The project's brains, keyed by document id, each with its name.
   */
  compile(
    id: string,
    name: string,
    source: string,
    held: CompiledBrain | undefined,
    names: ReadonlyMap<string, { readonly name: string }>
  ): EngineCompile {
    this._built.brainLiterals.applyBrains(names);
    this._built.assetLiterals.bindSource(source);
    this._built.brainLiterals.bindSource(source);
    const sourceHash = brainSourceHash(source);
    let document = true;
    try {
      readBrainSource(this._built.environment, source);
    } catch {
      document = false;
    }
    const compile: BrainSourceCompile = document
      ? compileBrainSource(this._built.environment, source)
      : { diagnostics: [], bytecode: undefined, unresolvedTiles: [] };
    const good = compile.bytecode !== undefined && compile.unresolvedTiles.length === 0;
    let registration: CompiledBrain | undefined;
    if (good && compile.bytecode !== undefined) {
      registration = { id, name, sourceHash, bytecode: compile.bytecode };
    } else if (held !== undefined) {
      registration = { id, name, sourceHash: held.sourceHash, bytecode: held.bytecode };
    }
    return {
      outcome: {
        sourceHash,
        compiled: registration === undefined ? null : { sourceHash: registration.sourceHash },
        diagnostics: wireDiagnostics(compile.diagnostics),
        unresolvedTiles: [...compile.unresolvedTiles],
      },
      registration,
    };
  }

  /**
   * Mint an empty one-page brain named `name` through the environment's
   * brain services, as its source text.
   *
   * @param name - Display name of the brain; any text, including empty.
   */
  mint(name: string): MintedBrain {
    const definition = BrainDef.emptyBrainDef(this._built.environment.brainServices, name);
    return { id: definition.id(), source: serializeBrainSource(definition) };
  }

  /** Takes the allocation `reading` holds; returns whether it differs from the one held. */
  private takeManifest(reading: MakeCodeManifestReading): boolean {
    const { ids, changed } = adoptIds(reading, this._ids);
    this._ids = ids;
    return changed;
  }

  /** A fresh environment for the inputs held, its asset literals following the held snapshot. */
  private build(): AuthoringEnvironment {
    const built = buildAuthoringEnvironment(this._catalogText, this._ids);
    built.assetLiterals.applySnapshot(this._assets);
    return built;
  }
}
