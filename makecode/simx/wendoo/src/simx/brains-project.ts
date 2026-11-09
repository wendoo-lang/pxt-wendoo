import type {
  MakeCodeAsset,
  MakeCodeBrainSummary,
  MakeCodeBrainsCreateRequest,
  MakeCodeBrainsPullRequest,
  MakeCodeBrainsPushRequest,
  MakeCodeBrainsRequest,
  MakeCodeManifestReading,
  MakeCodeWireBrain,
} from "@wendoo/makecode-session";
import { brainSourceHash } from "@wendoo/makecode-session";
import { type ProjfsClient, ProjfsError, type ProjfsErrorCode } from "../vendor/projfs.js";
import { BrainEngine, type EngineCompile } from "./brain-engine.js";
import {
  BRAINS_MODULE_FILE,
  type BrainsModuleProblemCode,
  type CompiledBrainEntry,
  BrainsModuleProblemCode as ProblemCode,
  readBrainsModule,
  writeBrainsModule,
} from "./brains-module.js";
import type { LivePrograms } from "./live-programs.js";
import type { SimxLog } from "./simx-bridge.js";

/**
 * The project-file operations a {@link BrainsProject} reads and writes the
 * project through: a projfs client's, naming files relative to the simulator
 * extension's folder.
 */
export type ProjectFiles = Pick<ProjfsClient, "list" | "read" | "write" | "delete">;

/** The folder, relative to the simulator extension's, holding one source file per brain. */
const SOURCE_FOLDER = "brains/";

/** The suffix of every brain source file's name. */
const SOURCE_SUFFIX = ".src.json";

/**
 * The name of the source file of the brain `id`, relative to the simulator
 * extension's folder: `brains/<id>.src.json`.
 *
 * @param id - The brain's document id.
 */
export function brainSourceFile(id: string): string {
  return `${SOURCE_FOLDER}${id}${SOURCE_SUFFIX}`;
}

/** Stable codes of a problem a {@link BrainsProject} meets compiling the project's brains. */
export const BrainsProjectProblemCode = {
  /**
   * Compiling a brain document threw. The compile is taken as producing no
   * program, no diagnostic and no unresolved tile, so the brain keeps its
   * last good registration. Logged once per brain per source hash.
   */
  COMPILE_THREW: "BRAINS_PROJECT_COMPILE_THREW",
} as const;

/** Union of all {@link BrainsProjectProblemCode} values. */
export type BrainsProjectProblemCode = (typeof BrainsProjectProblemCode)[keyof typeof BrainsProjectProblemCode];

/** What the log says about the brains module for each problem code. */
const PROBLEM_EXPLANATIONS: Record<BrainsModuleProblemCode, string> = {
  [ProblemCode.UNREADABLE]:
    "does not follow a format this simulator extension reads; no registration is read from it, and it is rewritten from the brain sources.",
  [ProblemCode.FORMAT_NEWER]:
    "was written by a newer simulator extension; no registration is read from it, and saves are refused so it is kept as it is.",
  [ProblemCode.ENTRY_MALFORMED]:
    "holds a registration that does not follow the format; that brain is recompiled from its source and the module rewritten.",
};

/** Timings of a {@link BrainsProject}, in milliseconds. Each defaults when left out. */
export interface BrainsProjectTimings {
  /** Wait before the first retry of a failed read or write; each later retry waits twice the one before. Default 500. */
  retryDelayMs?: number;
  /** Longest wait between retries, kept for every retry after it is reached. Default 30000. */
  maxRetryDelayMs?: number;
}

/** The projfs refusal codes no retry can overcome while this frame lives; a read or write refused with one is not asked again. */
const PERMANENT_REFUSALS: ReadonlySet<ProjfsErrorCode> = new Set<ProjfsErrorCode>([
  "PERMISSION_DENIED",
  "UNREGISTERED",
  "INVALID_NAME",
  "INVALID_REQUEST",
]);

/** One brain source file the project holds, as the frame last read or wrote it. */
interface HeldSource {
  /** The brain's display name: its document's name, else its registration's, else empty. */
  readonly name: string;
  /** The file's text. */
  readonly source: string;
  /** `brainSourceHash` of {@link source}. */
  readonly sourceHash: string;
}

/**
 * A change to one brain waiting for a drain: a write of its source, with the
 * compile it was given; a removal; or a new registration of a source the
 * project already holds, from a recompile.
 */
type Change =
  | { readonly op: "write"; readonly name: string; readonly source: string; compiled: EngineCompile }
  | { readonly op: "remove" }
  | { readonly op: "register"; readonly registration: CompiledBrainEntry };

/** An answer owed to a request once the change carrying it lands or fails. */
interface Answer {
  landed(): void;
  failed(message: string): void;
}

/** The change of one brain waiting for a drain, and every answer owed for it. */
interface Queued {
  change: Change;
  readonly answers: Answer[];
}

/**
 * The MakeCode project's brains, compiled and served by the simulator
 * extension: one source file per brain at {@link brainSourceFile}, holding
 * the brain document exactly as pushed or created, and the brains module at
 * `BRAINS_MODULE_FILE` registering every brain's compiled form, which this
 * project alone compiles and writes.
 *
 * On construction it reads every brain source file and the brains module
 * once, holding what it read as a cache derived from the files: each brain's
 * name, source and source hash, and the registrations of brains whose source
 * the project holds. A read the project fails is logged by its projfs code
 * and retried after a wait that doubles from
 * {@link BrainsProjectTimings.retryDelayMs} up to
 * {@link BrainsProjectTimings.maxRetryDelayMs}; a refusal no retry can
 * overcome -- `PERMISSION_DENIED`, `UNREGISTERED`, `INVALID_NAME`,
 * `INVALID_REQUEST` -- is logged once, and nothing is served. A brain whose
 * registration is missing, damaged or compiled from another source's hash is
 * then recompiled from its source, and a module holding anything else than
 * the registrations of the held brains is rewritten.
 *
 * Brains compile in a {@link BrainEngine} built from the latest catalog, the
 * project's id manifest and the asset snapshot, and every held brain is
 * recompiled whenever one of them changes. A compile producing a program with
 * every tile resolved replaces the brain's registration; any other keeps its
 * last good one. Each compile that changes a registration posts its program
 * to `live` at once.
 *
 * - A list names every held brain with its name, its source hash and the
 *   source hash its registration carries, `null` for none.
 * - A pull returns each requested brain held, its source verbatim.
 * - A push write is compiled as it arrives and answered with its compile's
 *   outcome; a removal posts the brain's removal to `live` and is answered
 *   with `null`.
 * - A create mints an empty brain document through the engine's brain
 *   services, compiles it, and is answered with its summary.
 *
 * Writes queue and are applied in drains. A drain takes every change queued
 * by then (the latest of each brain), writes the brains module once when its
 * text changes, then writes or deletes each brain's source file, answering
 * each request once its source has landed; a refused write fails the requests
 * it carried, the refusal's projfs code leading the message. A refused module
 * write carrying recompiled registrations is retried at the retry waits. A
 * write waits for MakeCode's answer however long it takes, and every write
 * is an artifact, never flagged as a user edit. Once a drain has landed
 * anything, the brains are announced to {@link onChange}.
 *
 * A damaged brains module yields every registration that is still readable,
 * and a coded line in the log for each problem; one written by a newer
 * simulator extension is read as registering nothing, is never rewritten,
 * and pushes and creates fail by its code while it stands.
 */
export class BrainsProject {
  private readonly _files: ProjectFiles;
  private readonly _log: SimxLog;
  private readonly _live: LivePrograms;
  private readonly _retryDelayMs: number;
  private readonly _maxRetryDelayMs: number;
  private readonly _engine = new BrainEngine();
  private readonly _listeners = new Set<(brains: MakeCodeBrainSummary[]) => void>();
  private readonly _timers = new Set<ReturnType<typeof setTimeout>>();
  /** The brain id and source hash of each compile throw logged, as `<id> <sourceHash>`. */
  private readonly _thrown = new Set<string>();
  /** Settles once the project's brains are read. */
  private readonly _ready: Promise<void>;
  /** The brain source files the project holds, by document id, in the order first held. */
  private readonly _sources = new Map<string, HeldSource>();
  /** The registrations the brains module holds, by document id. */
  private readonly _registrations = new Map<string, CompiledBrainEntry>();
  /** The brains module's text as last read or written, or `undefined` while the project holds none. */
  private _moduleText: string | undefined;
  /** Whether the brains module was written by a newer simulator extension. */
  private _formatNewer = false;
  private readonly _queue = new Map<string, Queued>();
  /** The changes of the drain writing now, by document id. */
  private _landing: ReadonlyMap<string, Change> = new Map();
  /** Whether the brains module must be written though no change is queued. */
  private _moduleStale = false;
  /** Whether every held brain must be recompiled before the next drain. */
  private _recompile = false;
  private _loaded = false;
  private _pumping = false;
  /** The wait before the next retry of a refused module write. */
  private _writeRetryDelay: number;
  /** Whether a retry of a refused module write is waiting. */
  private _writeRetrying = false;
  private _disposed = false;

  /**
   * @param files - The project's files, relative to the simulator extension's folder.
   * @param log - Receives a coded line for every refused request, failed read or write, brains module problem, and compile that throws.
   * @param live - Receives the program of every compile that changes a registration, and every removal.
   * @param timings - Retry timings; each left out takes its default.
   */
  constructor(files: ProjectFiles, log: SimxLog, live: LivePrograms, timings: BrainsProjectTimings = {}) {
    this._files = files;
    this._log = log;
    this._live = live;
    this._retryDelayMs = timings.retryDelayMs ?? 500;
    this._maxRetryDelayMs = timings.maxRetryDelayMs ?? 30_000;
    this._writeRetryDelay = this._retryDelayMs;
    this._ready = this.load(this._retryDelayMs);
  }

  /** Resolves with {@link summaries} once the project's brains are read. */
  current(): Promise<MakeCodeBrainSummary[]> {
    return this._ready.then(() => this.summaries());
  }

  /**
   * Every brain the project holds, in the order first held: its id, name,
   * source hash, and the source hash of its registration, `null` for none.
   * Empty until the project's brains are read.
   */
  summaries(): MakeCodeBrainSummary[] {
    return [...this._sources.keys()].map((id) => this.summaryOf(id)).filter((summary) => summary !== undefined);
  }

  /** Subscribe to the brains announced after each drain that landed anything. Returns an unsubscribe function. */
  onChange(listener: (brains: MakeCodeBrainSummary[]) => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * Take `catalogText` as the latest catalog and `reading` as the manifest
   * allocating it, recompiling every held brain when the engine rebuilds.
   *
   * @param catalogText - The catalog's serialized text, as published to the editor.
   * @param reading - The project's id manifest once the catalog is allocated.
   */
  adoptCatalog(catalogText: string, reading: MakeCodeManifestReading): void {
    if (this._engine.adoptCatalog(catalogText, reading)) this.rebuilt();
  }

  /**
   * Take `reading` as the project's id manifest, recompiling every held
   * brain when the engine rebuilds.
   *
   * @param reading - The project's id manifest, as the frame holds it.
   */
  adoptManifest(reading: MakeCodeManifestReading): void {
    if (this._engine.adoptManifest(reading)) this.rebuilt();
  }

  /**
   * Take `assets` as the latest asset snapshot, recompiling every held brain
   * when the engine rebuilds.
   *
   * @param assets - The project's asset snapshot.
   */
  adoptAssets(assets: readonly MakeCodeAsset[]): void {
    if (this._engine.adoptAssets(assets)) this.rebuilt();
  }

  /**
   * Answer `request` once the project's brains are read: a list or a pull at
   * once from what the project holds, a push or a create once its drain has
   * written it.
   *
   * @param request - A brains request from the editor.
   */
  serve(request: MakeCodeBrainsRequest): void {
    void this._ready.then(() => {
      if (this._disposed) return;
      switch (request.kind) {
        case "list":
          request.reply(this.summaries());
          return;
        case "pull":
          request.reply(this.pulled(request));
          return;
        case "push":
          this.push(request);
          return;
        case "create":
          this.create(request);
          return;
      }
    });
  }

  /** Stop retrying failed reads and writes. */
  dispose(): void {
    this._disposed = true;
    for (const timer of this._timers) clearTimeout(timer);
    this._timers.clear();
    this._listeners.clear();
  }

  /** The requested brains held, in request order, each id held no brain under left out. */
  private pulled(request: MakeCodeBrainsPullRequest): MakeCodeWireBrain[] {
    return request.ids.flatMap((id) => {
      const held = this._sources.get(id);
      if (held === undefined) return [];
      const compiledSourceHash = this._registrations.get(id)?.sourceHash ?? null;
      return [{ id, name: held.name, source: held.source, compiledSourceHash }];
    });
  }

  /** Compiles a pushed write and queues it, or queues a removal and posts it live. */
  private push(request: MakeCodeBrainsPushRequest): void {
    if (this.refusedNewer(request)) return;
    const { push } = request;
    if (push.op === "remove") {
      this.enqueue(push.brainId, { op: "remove" }, { landed: () => request.reply(null), failed: request.fail });
      this._live.remove(push.brainId);
      return;
    }
    const { id, source } = push.brain;
    const change = this.writeOf(id, brainName(source, push.brain.name), source);
    this.enqueue(id, change, { landed: () => request.reply(change.compiled.outcome), failed: request.fail });
  }

  /** Mints an empty brain named as `request` asks, compiles it and queues its write. */
  private create(request: MakeCodeBrainsCreateRequest): void {
    if (this.refusedNewer(request)) return;
    const minted = this._engine.mint(request.name);
    const change = this.writeOf(minted.id, brainName(minted.source, request.name), minted.source);
    this.enqueue(minted.id, change, {
      landed: () => {
        const summary = this.summaryOf(minted.id);
        if (summary === undefined) request.fail(`${brainSourceFile(minted.id)} was not written.`);
        else request.reply(summary);
      },
      failed: request.fail,
    });
  }

  /** Fails `request` by code while the brains module is of a newer format; returns whether it did. */
  private refusedNewer(request: MakeCodeBrainsPushRequest | MakeCodeBrainsCreateRequest): boolean {
    if (!this._formatNewer) return false;
    request.fail(
      `${ProblemCode.FORMAT_NEWER}: ${BRAINS_MODULE_FILE} ${PROBLEM_EXPLANATIONS[ProblemCode.FORMAT_NEWER]}`
    );
    return true;
  }

  /** The write of `source`, the brain `id` named `name`, compiled over its registration now, its program posted live when it changes. */
  private writeOf(id: string, name: string, source: string): Change & { op: "write" } {
    const before = this.registrationOf(id);
    const compiled = this.compiled(id, name, source, before);
    this.registered(before, compiled.registration);
    return { op: "write", name, source, compiled };
  }

  /** Queues `change` of the brain `id`, replacing any change queued for it, with `answer` owed once it lands. */
  private enqueue(id: string, change: Change, answer?: Answer): void {
    const queued = this._queue.get(id);
    if (queued === undefined) {
      this._queue.set(id, { change, answers: answer === undefined ? [] : [answer] });
    } else {
      queued.change = change;
      if (answer !== undefined) queued.answers.push(answer);
    }
    this.pump();
  }

  /** Recompiles every held brain before the next drain, once the project's brains are read. */
  private rebuilt(): void {
    if (!this._loaded) return;
    this._recompile = true;
    this.pump();
  }

  /**
   * Runs recompiles and drains, one at a time, until none is due, starting
   * once the calls running now have queued what they queue.
   */
  private pump(): void {
    if (this._pumping || this._disposed) return;
    this._pumping = true;
    void Promise.resolve().then(async () => {
      try {
        while (!this._disposed && this.due()) {
          if (this._recompile) {
            this._recompile = false;
            this.recompile(() => true);
          }
          if (this.due()) await this.drain();
        }
      } finally {
        this._pumping = false;
      }
    });
  }

  /**
   * Recompiles each brain `selected` picks, by its id and source text, among
   * those the project holds or a queued write carries: a queued write takes
   * its new compile, and a held source whose registration changes queues the
   * new registration. Each changed registration is posted live. Under a
   * newer-format module nothing is recompiled.
   */
  private recompile(selected: (id: string, source: string) => boolean): void {
    if (this._formatNewer) return;
    for (const id of new Set([...this._sources.keys(), ...this._queue.keys()])) {
      const change = this._queue.get(id)?.change;
      if (change?.op === "remove") continue;
      const before = this.registrationOf(id);
      if (change?.op === "write") {
        if (!selected(id, change.source)) continue;
        change.compiled = this.compiled(id, change.name, change.source, before);
        this.registered(before, change.compiled.registration);
        continue;
      }
      const held = this._sources.get(id);
      if (held === undefined || !selected(id, held.source)) continue;
      const { registration } = this.compiled(id, held.name, held.source, before);
      if (registration === undefined || sameRegistration(before, registration)) continue;
      this.enqueue(id, { op: "register", registration });
      this.registered(before, registration);
    }
  }

  /**
   * The engine's compile of `source`, the brain `id` named `name`, over the
   * registration `before`. A compile that throws keeps `before`, reporting no
   * diagnostic and no unresolved tile, and is logged under
   * `BrainsProjectProblemCode.COMPILE_THREW` once per brain per source hash.
   */
  private compiled(id: string, name: string, source: string, before: CompiledBrainEntry | undefined): EngineCompile {
    try {
      return this._engine.compile(id, name, source, before, this.names());
    } catch (error) {
      const sourceHash = brainSourceHash(source);
      const key = `${id} ${sourceHash}`;
      if (!this._thrown.has(key)) {
        this._thrown.add(key);
        this._log.error(
          `${BrainsProjectProblemCode.COMPILE_THREW}: compiling ${brainSourceFile(id)} (${sourceHash}) threw ${String(error)}; it keeps its last good registration.`
        );
      }
      return {
        outcome: {
          sourceHash,
          compiled: before === undefined ? null : { sourceHash: before.sourceHash },
          diagnostics: [],
          unresolvedTiles: [],
        },
        registration: before === undefined ? undefined : { ...before, id, name },
      };
    }
  }

  /** Posts `after` live when it registers another program than `before`. */
  private registered(before: CompiledBrainEntry | undefined, after: CompiledBrainEntry | undefined): void {
    if (after !== undefined && !sameRegistration(before, after)) this._live.post(after);
  }

  /**
   * The brain `id`'s registration as the latest change leaves it: a queued
   * change's, else the change of the drain writing now, else the module's.
   */
  private registrationOf(id: string): CompiledBrainEntry | undefined {
    const change = this._queue.get(id)?.change ?? this._landing.get(id);
    if (change === undefined) return this._registrations.get(id);
    if (change.op === "write") return change.compiled.registration;
    return change.op === "register" ? change.registration : undefined;
  }

  /** The brains as the latest changes leave them, keyed by document id, each with its name. */
  private names(): Map<string, { readonly name: string }> {
    const names = new Map<string, { readonly name: string }>(this._sources);
    const changes = [...this._landing, ...[...this._queue].map(([id, { change }]) => [id, change] as const)];
    for (const [id, change] of changes) {
      if (change.op === "write") names.set(id, change);
      else if (change.op === "remove") names.delete(id);
    }
    return names;
  }

  /**
   * Takes every queued change, writes the brains module once when its text
   * changes, then each brain's source file, answering every request as its
   * change lands or fails, and announces the brains once anything landed.
   */
  private async drain(): Promise<void> {
    const batch = [...this._queue];
    this._queue.clear();
    this._landing = new Map(batch.map(([id, { change }]) => [id, change]));
    try {
      await this.write(batch);
    } finally {
      this._landing = new Map();
    }
  }

  /** Writes the brains module and the source files for the changes `batch` carries, as {@link drain} describes. */
  private async write(batch: readonly [string, Queued][]): Promise<void> {
    const stale = this._moduleStale;
    this._moduleStale = false;
    const registrations = new Map<string, CompiledBrainEntry>();
    for (const [id, registration] of this._registrations) {
      if (this._sources.has(id)) registrations.set(id, registration);
    }
    for (const [id, { change }] of batch) {
      const registration =
        change.op === "write"
          ? change.compiled.registration
          : change.op === "register"
            ? change.registration
            : undefined;
      if (registration === undefined) registrations.delete(id);
      else registrations.set(id, registration);
    }
    const text = writeBrainsModule(registrations.values());
    const writesModule = text !== this._moduleText;
    if (writesModule) {
      try {
        await this._files.write(BRAINS_MODULE_FILE, text);
      } catch (error) {
        this.moduleRefused(batch, stale, error);
        return;
      }
      this._moduleText = text;
    }
    this._writeRetryDelay = this._retryDelayMs;
    this._registrations.clear();
    for (const [id, registration] of registrations) this._registrations.set(id, registration);
    const landed = await Promise.all(batch.map(([id, queued]) => this.applySource(id, queued)));
    if (!writesModule && !landed.includes(true)) return;
    const brains = this.summaries();
    for (const listener of this._listeners) listener(brains);
  }

  /**
   * Fails every request `batch` carries for the refused module write
   * `error`. Unless the refusal is one no retry can overcome, puts its
   * recompiled registrations back in the queue -- each unless a later change
   * of its brain is queued -- and writes the module again after the next
   * retry wait.
   *
   * @param stale - Whether the module was to be written though no change was queued.
   */
  private moduleRefused(batch: readonly [string, Queued][], stale: boolean, error: unknown): void {
    const message = describeError(error);
    const retryable = this.logFailure(error, `writing ${BRAINS_MODULE_FILE}`);
    let retry = retryable && stale;
    for (const [id, queued] of batch) {
      for (const answer of queued.answers) answer.failed(message);
      if (retryable && queued.change.op === "register" && !this._queue.has(id)) {
        this._queue.set(id, { change: queued.change, answers: [] });
        retry = true;
      }
    }
    if (!retry) return;
    if (stale) this._moduleStale = true;
    if (this._writeRetrying) return;
    this._writeRetrying = true;
    const delay = this._writeRetryDelay;
    this._writeRetryDelay = this.nextDelay(delay);
    void this.wait(delay).then(() => {
      this._writeRetrying = false;
      this.pump();
    });
  }

  /** Whether a recompile or a drain is due: a module write waiting to be retried waits, unless a request is queued. */
  private due(): boolean {
    if (this._recompile) return true;
    if (this._queue.size === 0 && !this._moduleStale) return false;
    return !this._writeRetrying || [...this._queue.values()].some((queued) => queued.answers.length > 0);
  }

  /**
   * Writes or deletes the source file of one brain the drain carries, and
   * answers every request owed for it. Resolves with whether a change
   * landed: a write or a removal applied, or a registration, which the
   * module write landed.
   */
  private async applySource(id: string, queued: Queued): Promise<boolean> {
    const { change } = queued;
    if (change.op === "register") return true;
    const file = brainSourceFile(id);
    try {
      if (change.op === "write") {
        await this._files.write(file, change.source);
      } else {
        await this._files.delete(file).catch((error: unknown) => {
          if (!(error instanceof ProjfsError && error.code === "NOT_FOUND")) throw error;
        });
      }
    } catch (error) {
      const message = describeError(error);
      this._log.error(`${message} (saving ${file})`);
      for (const answer of queued.answers) answer.failed(message);
      return false;
    }
    if (change.op === "write") {
      this._sources.set(id, { name: change.name, source: change.source, sourceHash: brainSourceHash(change.source) });
    } else {
      this._sources.delete(id);
      this._registrations.delete(id);
    }
    for (const answer of queued.answers) answer.landed();
    return true;
  }

  /** The summary of the held brain `id`, or `undefined` when the project holds none under it. */
  private summaryOf(id: string): MakeCodeBrainSummary | undefined {
    const held = this._sources.get(id);
    if (held === undefined) return undefined;
    const compiledSourceHash = this._registrations.get(id)?.sourceHash ?? null;
    return { id, name: held.name, sourceHash: held.sourceHash, compiledSourceHash };
  }

  /**
   * Reads every brain source file and the brains module, retrying after
   * `retryDelay` while the project fails a read, then heals what the module
   * lacks; settles once read, and never after a refusal no retry can
   * overcome.
   */
  private async load(retryDelay: number): Promise<void> {
    let ids: string[];
    let sources: (string | undefined)[];
    let text: string | undefined;
    try {
      const files = await this._files.list();
      ids = files.flatMap((file) => brainIdOf(file.name) ?? []);
      [sources, text] = await Promise.all([
        Promise.all(ids.map((id) => this.readIfPresent(brainSourceFile(id)))),
        this.readIfPresent(BRAINS_MODULE_FILE),
      ]);
    } catch (error) {
      if (!this.logFailure(error, "reading the project's brains")) return new Promise(() => {});
      await this.wait(retryDelay);
      return this.load(this.nextDelay(retryDelay));
    }
    const reading = text === undefined ? undefined : readBrainsModule(text);
    for (const problem of reading?.problems ?? []) {
      const where = problem.line === undefined ? BRAINS_MODULE_FILE : `${BRAINS_MODULE_FILE} line ${problem.line}`;
      this._log.error(`${problem.code}: ${where} ${PROBLEM_EXPLANATIONS[problem.code]}`);
    }
    this._moduleText = text;
    this._formatNewer = reading?.problems.some((problem) => problem.code === ProblemCode.FORMAT_NEWER) === true;
    ids.forEach((id, index) => {
      const source = sources[index];
      if (source === undefined) return;
      const entry = reading?.entries.get(id);
      this._sources.set(id, {
        name: brainName(source, entry?.name ?? ""),
        source,
        sourceHash: brainSourceHash(source),
      });
      if (entry !== undefined) this._registrations.set(id, entry);
    });
    this._loaded = true;
    if (this._formatNewer) return;
    this._moduleStale = text !== undefined && text !== writeBrainsModule(this._registrations.values());
    this.recompile((id, source) => this._registrations.get(id)?.sourceHash !== brainSourceHash(source));
    this.pump();
  }

  /** The content of the file `name`, or `undefined` when the project does not hold it. */
  private async readIfPresent(name: string): Promise<string | undefined> {
    try {
      return await this._files.read(name);
    } catch (error) {
      if (error instanceof ProjfsError && error.code === "NOT_FOUND") return undefined;
      throw error;
    }
  }

  /** Logs `error`, met while `doing`, by its projfs code; returns whether a retry can overcome it. */
  private logFailure(error: unknown, doing: string): boolean {
    const code = error instanceof ProjfsError ? error.code : undefined;
    this._log.error(`${describeError(error)} (${doing})`);
    return code === undefined || !PERMANENT_REFUSALS.has(code);
  }

  /** Resolves after `ms` milliseconds; never once disposed. */
  private wait(ms: number): Promise<void> {
    if (this._disposed) return new Promise(() => {});
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._timers.delete(timer);
        if (!this._disposed) resolve();
      }, ms);
      this._timers.add(timer);
    });
  }

  /** The wait after `retryDelay`: twice it, up to the longest wait. */
  private nextDelay(retryDelay: number): number {
    return Math.min(retryDelay * 2, this._maxRetryDelayMs);
  }
}

/** Whether `a` and `b` are the same registration: the same name, source hash and bytes. */
function sameRegistration(a: CompiledBrainEntry | undefined, b: CompiledBrainEntry): boolean {
  if (a === undefined || a.name !== b.name || a.sourceHash !== b.sourceHash) return false;
  return a.bytecode.length === b.bytecode.length && a.bytecode.every((byte, index) => byte === b.bytecode[index]);
}

/** The id of the brain whose source file is `name`, or `undefined` when `name` is not a brain source file. */
function brainIdOf(name: string): string | undefined {
  if (!name.startsWith(SOURCE_FOLDER) || !name.endsWith(SOURCE_SUFFIX)) return undefined;
  const id = name.slice(SOURCE_FOLDER.length, name.length - SOURCE_SUFFIX.length);
  return id.length > 0 && !id.includes("/") ? id : undefined;
}

/** The display name of a brain: the name its source document carries, else `fallback`. */
function brainName(source: string, fallback: string): string {
  try {
    const document: unknown = JSON.parse(source);
    if (typeof document === "object" && document !== null) {
      const { name } = document as { name?: unknown };
      if (typeof name === "string") return name;
    }
  } catch {
    // Not a brain document; the fallback names it.
  }
  return fallback;
}

/** `error` as the message of a failed request: a projfs refusal's code leading its message. */
function describeError(error: unknown): string {
  return error instanceof ProjfsError ? `${error.code}: ${error.message}` : String(error);
}
