import type { MakeCodeIdManifest, MakeCodeManifestReading } from "@wendoo/makecode-session";
import { MakeCodeManifestProblemCode } from "@wendoo/makecode-session";
import { parseCatalog } from "../authoring/catalog.js";
import { allocateIds, emptyIdManifest, sameIdManifest } from "../authoring/id-allocation.js";
import { ProjfsError } from "../vendor/projfs.js";
import { IDS_MODULE_FILE, readIdsModule, writeIdsModule } from "./ids-module.js";
import { describeProjfsError, PROJFS_PERMANENT_REFUSALS, type ProjectFiles } from "./project-files.js";
import type { SimxLog } from "./simx-bridge.js";

/** What the log says about the ids module for each problem code. */
const PROBLEM_EXPLANATIONS: Record<MakeCodeManifestProblemCode, string> = {
  [MakeCodeManifestProblemCode.UNREADABLE]:
    "declares no format this simulator extension reads; no id is read from it, and the next allocation replaces it.",
  [MakeCodeManifestProblemCode.FORMAT_NEWER]:
    "was written by a newer simulator extension; no id is read from it, and it is never written so it is kept as it is.",
  [MakeCodeManifestProblemCode.ENTRY_MALFORMED]:
    "holds a line that does not follow the format; the rest is read, and the next allocation replaces it.",
};

/** Timings of a {@link ManifestProject}, in milliseconds. Each defaults when left out. */
export interface ManifestProjectTimings {
  /** Wait before the first retry of a failed read or write; each later retry waits twice the one before. Default 500. */
  retryDelayMs?: number;
  /** Longest wait between retries, kept for every retry after it is reached. Default 30000. */
  maxRetryDelayMs?: number;
}

/**
 * The MakeCode project's id manifest, held and allocated by the simulator
 * extension: the one allocator of the project's ids and the one writer of
 * the ids module at {@link IDS_MODULE_FILE}.
 *
 * On construction it reads the ids module once into its current reading. A
 * project holding no module reads as no manifest. A module that is
 * unreadable or holds a malformed line is logged by its problem code and
 * held without the problem -- its readable entries kept -- and the next
 * allocation replaces it. A module of a newer format is held as no manifest
 * under `FORMAT_NEWER`: it is never allocated over and never written.
 *
 * {@link adopt} allocates every name a catalog declares above the
 * watermarks, appending and never renumbering, and writes the module when
 * the allocation differs from what the module declares.
 *
 * {@link reported} takes MakeCode's word that the module changed and reads
 * it again. A text equal to the one last read or written changes nothing.
 * A module gone, unreadable or holding a malformed line is restored: the
 * current reading is kept and the allocation it holds is written back as
 * the module, an unreadable or malformed module's problem logged by code. A module of a newer
 * format is held under `FORMAT_NEWER` and never written. A readable module
 * is adopted as it declares, the last catalog adopted allocated over it
 * without renumbering it, and written when that allocation differs from
 * what it declares. A re-read that changes the current reading announces it
 * to {@link onChange}. Every write is an
 * artifact, never flagged as a user edit. A read or write the project fails
 * is logged by its projfs code and retried after a wait that doubles from
 * {@link ManifestProjectTimings.retryDelayMs} up to
 * {@link ManifestProjectTimings.maxRetryDelayMs}, for as long as it takes; a
 * refusal no retry can overcome -- `PERMISSION_DENIED`, `UNREGISTERED`,
 * `INVALID_NAME`, `INVALID_REQUEST` -- is logged once and not asked again.
 * Reads, allocations and writes run one at a time, in the order asked.
 */
export class ManifestProject {
  private readonly _files: ProjectFiles;
  private readonly _log: SimxLog;
  private readonly _retryDelayMs: number;
  private readonly _maxRetryDelayMs: number;
  private readonly _timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly _listeners = new Set<(reading: MakeCodeManifestReading) => void>();
  /** Settles once the module is read and every step queued so far has run. */
  private _tail: Promise<void>;
  private _reading: MakeCodeManifestReading = { manifest: null };
  /** The module's text as last read or written, or `undefined` while the project holds none. */
  private _text: string | undefined;
  /** The text of the last catalog adopted, or `undefined` before the first. */
  private _catalogText: string | undefined;
  /** Whether a re-read of the module is queued or waiting to retry, and not yet sent. */
  private _rereading = false;
  /**
   * The allocation the ids module declares as far as this project knows, or
   * `undefined` when the module must be replaced whatever the allocation.
   */
  private _declared: MakeCodeIdManifest | undefined;
  /** Whether a retry of a failed write is waiting or running. */
  private _retrying = false;
  /** Whether a write was refused with a code no retry can overcome. */
  private _writesRefused = false;
  private _disposed = false;

  /**
   * @param files - The project's files, relative to the simulator extension's folder.
   * @param log - Receives a coded line for every failed read or write and every ids module problem.
   * @param timings - Retry timings; each left out takes its default.
   */
  constructor(files: ProjectFiles, log: SimxLog, timings: ManifestProjectTimings = {}) {
    this._files = files;
    this._log = log;
    this._retryDelayMs = timings.retryDelayMs ?? 500;
    this._maxRetryDelayMs = timings.maxRetryDelayMs ?? 30_000;
    this._tail = this.load(this._retryDelayMs);
  }

  /** Resolves with the current reading once the module is read and every allocation asked before has run. */
  current(): Promise<MakeCodeManifestReading> {
    return this.enqueue(async () => this._reading);
  }

  /**
   * Allocate every name `catalogText` declares that the current manifest
   * lacks, and write the module when the allocation differs from what it
   * declares. Resolves with the current reading once that write has landed
   * or failed; a failed write is retried. Under `FORMAT_NEWER` nothing is
   * allocated or written.
   *
   * @param catalogText - The catalog's serialized text.
   */
  adopt(catalogText: string): Promise<MakeCodeManifestReading> {
    return this.enqueue(async () => {
      this._catalogText = catalogText;
      if (this._reading.problem === MakeCodeManifestProblemCode.FORMAT_NEWER) return this._reading;
      const held = this._reading.manifest ?? emptyIdManifest();
      const allocated = allocateIds(held, parseCatalog(catalogText));
      if (!sameIdManifest(allocated, held)) this._reading = { manifest: allocated };
      await this.write();
      return this._reading;
    });
  }

  /**
   * Subscribe to each reading a re-read of the module makes current, unlike
   * the one before it. Returns an unsubscribe function.
   */
  onChange(listener: (reading: MakeCodeManifestReading) => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * Read the module again, as MakeCode reports it changed, once every step
   * queued before has run. A read the project fails is logged and retried
   * after a wait that doubles from {@link ManifestProjectTimings.retryDelayMs}
   * up to {@link ManifestProjectTimings.maxRetryDelayMs}; one refused for good
   * is logged and dropped.
   */
  reported(): void {
    if (this._disposed || this._rereading) return;
    this._rereading = true;
    void this.reread(this._retryDelayMs);
  }

  /** Stop retrying failed reads and writes. */
  dispose(): void {
    this._disposed = true;
    for (const timer of this._timers) clearTimeout(timer);
    this._timers.clear();
    this._listeners.clear();
  }

  /** Runs `step` once every step queued before it has run. */
  private enqueue<T>(step: () => Promise<T>): Promise<T> {
    const run = this._tail.then(step);
    this._tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  /**
   * Reads the module into the current reading, retrying after `retryDelay`
   * while the project fails the read; settles once it is read, and never
   * after a refusal no retry can overcome.
   */
  private async load(retryDelay: number): Promise<void> {
    let text: string | undefined;
    try {
      text = await this._files.read(IDS_MODULE_FILE);
    } catch (error) {
      if (!(error instanceof ProjfsError && error.code === "NOT_FOUND")) {
        if (!this.logFailure(error, `reading ${IDS_MODULE_FILE}`)) return new Promise(() => {});
        await this.wait(retryDelay);
        return this.load(this.nextDelay(retryDelay));
      }
    }
    this.take(text);
  }

  /**
   * Reads the module once more, retrying after `retryDelay` while the project
   * fails the read, and adopts what it holds as the class documentation
   * describes for a reported change.
   */
  private reread(retryDelay: number): Promise<void> {
    return this.enqueue(async () => {
      this._rereading = false;
      let text: string | undefined;
      try {
        text = await this._files.read(IDS_MODULE_FILE);
      } catch (error) {
        if (!(error instanceof ProjfsError && error.code === "NOT_FOUND")) {
          if (!this.logFailure(error, `re-reading ${IDS_MODULE_FILE}`)) return;
          this._rereading = true;
          void this.wait(retryDelay).then(() => this.reread(this.nextDelay(retryDelay)));
          return;
        }
      }
      if (text === this._text) return;
      const before = this._reading;
      const reading = text === undefined ? undefined : readIdsModule(text);
      const problem = reading?.problem;
      if (
        reading === undefined ||
        problem === MakeCodeManifestProblemCode.UNREADABLE ||
        problem === MakeCodeManifestProblemCode.ENTRY_MALFORMED
      ) {
        if (problem !== undefined) {
          this._log.error(
            `${problem}: ${IDS_MODULE_FILE} was damaged while this frame ran; the allocation this frame holds is written back.`
          );
        }
        this._text = text;
        this._declared = undefined;
        await this.write();
        return;
      }
      this.take(text);
      const catalogText = this._catalogText;
      if (this._reading.problem !== MakeCodeManifestProblemCode.FORMAT_NEWER && catalogText !== undefined) {
        const held = this._reading.manifest ?? emptyIdManifest();
        const allocated = allocateIds(held, parseCatalog(catalogText));
        if (!sameIdManifest(allocated, held)) this._reading = { manifest: allocated };
        await this.write();
      }
      if (sameReading(before, this._reading)) return;
      for (const listener of this._listeners) listener(this._reading);
    });
  }

  /**
   * Takes `text` as the module's, `undefined` for none, as the current
   * reading, logging its problem by code: a module of a newer format held as
   * no manifest under `FORMAT_NEWER`; any other problem held without it, its
   * readable entries kept, and the module to be replaced at the next write.
   */
  private take(text: string | undefined): void {
    this._text = text;
    if (text === undefined) {
      this._reading = { manifest: null };
      this._declared = emptyIdManifest();
      return;
    }
    const reading = readIdsModule(text);
    if (reading.problem !== undefined) {
      this._log.error(`${reading.problem}: ${IDS_MODULE_FILE} ${PROBLEM_EXPLANATIONS[reading.problem]}`);
    }
    if (reading.problem === MakeCodeManifestProblemCode.FORMAT_NEWER) {
      this._reading = reading;
      return;
    }
    this._reading = { manifest: reading.manifest };
    this._declared = reading.problem === undefined ? (reading.manifest ?? emptyIdManifest()) : undefined;
  }

  /**
   * Writes the current allocation to the module when it differs from what
   * the module declares, unless a write was refused for good. A failed write
   * is logged and, unless a retry is already waiting, written again after
   * the next retry wait -- {@link ManifestProjectTimings.retryDelayMs} for a
   * first write, else the wait after `retryDelay` -- once every step queued
   * by then has run.
   *
   * @param retryDelay - The wait before the retry this write is, or `undefined` for a first write.
   */
  private async write(retryDelay?: number): Promise<void> {
    const manifest = this._reading.manifest ?? emptyIdManifest();
    const newer = this._reading.problem === MakeCodeManifestProblemCode.FORMAT_NEWER;
    const differs = this._declared === undefined || !sameIdManifest(this._declared, manifest);
    if (!this._writesRefused && !newer && differs) {
      try {
        const text = writeIdsModule(manifest);
        await this._files.write(IDS_MODULE_FILE, text);
        this._text = text;
        this._declared = manifest;
      } catch (error) {
        if (!this.logFailure(error, `writing ${IDS_MODULE_FILE}`)) {
          this._writesRefused = true;
          return;
        }
        if (retryDelay === undefined && this._retrying) return;
        this._retrying = true;
        const delay = retryDelay === undefined ? this._retryDelayMs : this.nextDelay(retryDelay);
        void this.wait(delay).then(() => this.enqueue(() => this.write(delay)));
        return;
      }
    }
    if (retryDelay !== undefined) this._retrying = false;
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

  /** Logs `error`, met while `doing`, by its projfs code; returns whether a retry can overcome it. */
  private logFailure(error: unknown, doing: string): boolean {
    const code = error instanceof ProjfsError ? error.code : undefined;
    this._log.error(`${describeProjfsError(error)} (${doing})`);
    return code === undefined || !PROJFS_PERMANENT_REFUSALS.has(code);
  }

  /** The wait after `retryDelay`: twice it, up to the longest wait. */
  private nextDelay(retryDelay: number): number {
    return Math.min(retryDelay * 2, this._maxRetryDelayMs);
  }
}

/** Whether `a` and `b` are the same reading: the same problem, and the same allocation or none. */
function sameReading(a: MakeCodeManifestReading, b: MakeCodeManifestReading): boolean {
  if (a.problem !== b.problem) return false;
  if (a.manifest === null || b.manifest === null) return a.manifest === b.manifest;
  return sameIdManifest(a.manifest, b.manifest);
}
