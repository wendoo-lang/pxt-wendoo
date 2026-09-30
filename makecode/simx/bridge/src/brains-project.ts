import type {
  MakeCodeBrain,
  MakeCodeBrainPush,
  MakeCodeBrainSummary,
  MakeCodeBrainsListRequest,
  MakeCodeBrainsPullRequest,
  MakeCodeBrainsPushRequest,
  MakeCodeBrainsRequest,
} from "@wendoo/makecode-session";
import { brainSourceHash } from "@wendoo/makecode-session";
import {
  BRAINS_MODULE_FILE,
  type BrainsModuleProblemCode,
  type BrainsModuleReading,
  type CompiledBrainEntry,
  BrainsModuleProblemCode as ProblemCode,
  readBrainsModule,
  writeBrainsModule,
} from "./brains-module.js";
import type { SimxLog } from "./simx-bridge.js";
import { type ProjfsClient, ProjfsError } from "./vendor/projfs.js";

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

/** What the log says about the brains module for each problem code. */
const PROBLEM_EXPLANATIONS: Record<BrainsModuleProblemCode, string> = {
  [ProblemCode.UNREADABLE]:
    "declares no format this simulator extension reads; no compiled brain is served from it, and the next save rewrites it.",
  [ProblemCode.FORMAT_NEWER]:
    "was written by a newer simulator extension; no compiled brain is served from it, and saves are refused so it is kept as it is.",
  [ProblemCode.ENTRY_MALFORMED]:
    "holds a registration that does not follow the format; that brain is served without its compiled form.",
};

/** The brains module as a drain found it: its text, when the project holds one, and what was read from it. */
interface ModuleState {
  readonly text: string | undefined;
  readonly reading: BrainsModuleReading;
}

/** The pushes of one brain waiting for a drain: the latest change, and every request asking for one. */
interface QueuedPush {
  push: MakeCodeBrainPush;
  readonly requests: MakeCodeBrainsPushRequest[];
}

/**
 * The MakeCode project's brains, as the party serving the project answers
 * brains requests from them: one source file per brain at
 * {@link brainSourceFile}, holding the brain document exactly as pushed, and
 * the brains module at `BRAINS_MODULE_FILE` registering every brain's
 * compiled form. Everything served is read from the project's files at the
 * time of the request, so instances hold no brains of their own.
 *
 * - A list names every brain source file, with the document's name and the
 *   `brainSourceHash` of the file's text.
 * - A pull returns each requested brain the project holds, its source
 *   verbatim and its compiled form as the brains module registers it.
 * - Pushes queue and are applied in drains. A drain reads the project,
 *   takes every push queued by then (the latest push of each brain, when one
 *   brain was pushed more than once), writes the brains module once --
 *   regenerated from its current registrations of brains whose source file
 *   exists, with the drain's changes applied -- and then writes or deletes
 *   each brain's source file. Each push is acknowledged once its brain's
 *   source file has landed after that module write; a refused write fails
 *   the pushes it carried, with the refusal's projfs code leading the
 *   message. Every write is an artifact, never flagged as a user edit.
 *
 * A name is read from a source that is not a readable brain document from
 * its registration, or is empty. A damaged brains module yields every
 * registration that is still readable, and a coded line in the log for each
 * problem; one written by a newer simulator extension is never rewritten,
 * and pushes fail while it stands.
 */
export class BrainsProject {
  private readonly _files: ProjectFiles;
  private readonly _log: SimxLog;
  private readonly _queue = new Map<string, QueuedPush>();
  private _draining = false;

  /**
   * @param files - The project's files, relative to the simulator extension's folder.
   * @param log - Receives a coded line for every refused request and every brains module problem.
   */
  constructor(files: ProjectFiles, log: SimxLog) {
    this._files = files;
    this._log = log;
  }

  /**
   * Answer `request` from the project's files: a list or a pull once the
   * files are read, a push once its drain has written it.
   *
   * @param request - A brains request from the editor.
   */
  serve(request: MakeCodeBrainsRequest): void {
    switch (request.kind) {
      case "list":
        void this.list(request);
        return;
      case "pull":
        void this.pull(request);
        return;
      case "push":
        this.enqueue(request);
        return;
    }
  }

  private async list(request: MakeCodeBrainsListRequest): Promise<void> {
    let brains: MakeCodeBrainSummary[];
    try {
      const files = await this._files.list();
      const ids = files.flatMap((file) => brainIdOf(file.name) ?? []);
      const [module, sources] = await Promise.all([this.readModule(), this.readSources(ids)]);
      brains = ids.flatMap((id, index) => {
        const source = sources[index];
        if (source === undefined) return [];
        return [{ id, name: brainName(source, module.reading.entries.get(id)), sourceHash: brainSourceHash(source) }];
      });
    } catch (error) {
      this.refused(request, error, "listing the brains");
      return;
    }
    request.reply(brains);
  }

  private async pull(request: MakeCodeBrainsPullRequest): Promise<void> {
    let brains: MakeCodeBrain[];
    try {
      const [module, sources] = await Promise.all([this.readModule(), this.readSources(request.ids)]);
      brains = request.ids.flatMap((id, index) => {
        const source = sources[index];
        if (source === undefined) return [];
        const entry = module.reading.entries.get(id);
        const pulled: MakeCodeBrain = { id, name: brainName(source, entry), source };
        if (entry !== undefined) pulled.compiled = { bytecode: entry.bytecode, sourceHash: entry.sourceHash };
        return [pulled];
      });
    } catch (error) {
      this.refused(request, error, "pulling brains");
      return;
    }
    request.reply(brains);
  }

  private enqueue(request: MakeCodeBrainsPushRequest): void {
    const id = request.push.op === "write" ? request.push.brain.id : request.push.brainId;
    const queued = this._queue.get(id);
    if (queued === undefined) {
      this._queue.set(id, { push: request.push, requests: [request] });
    } else {
      queued.push = request.push;
      queued.requests.push(request);
    }
    if (!this._draining) void this.drain();
  }

  /** Applies queued pushes, drain after drain, until none is queued. */
  private async drain(): Promise<void> {
    this._draining = true;
    try {
      while (this._queue.size > 0) await this.applyDrain();
    } finally {
      this._draining = false;
    }
  }

  /** Reads the project, takes the queued pushes, writes the brains module, then each brain's source file. */
  private async applyDrain(): Promise<void> {
    let files: string[];
    let module: ModuleState;
    try {
      files = (await this._files.list()).map((file) => file.name);
      module = await this.readModule();
    } catch (error) {
      this.failAll(this.takeQueue(), error, "reading the project before saving brains");
      return;
    }
    const batch = this.takeQueue();
    if (module.reading.problems.some((problem) => problem.code === ProblemCode.FORMAT_NEWER)) {
      const message = `${ProblemCode.FORMAT_NEWER}: ${BRAINS_MODULE_FILE} ${PROBLEM_EXPLANATIONS[ProblemCode.FORMAT_NEWER]}`;
      for (const queued of batch) for (const request of queued.requests) request.fail(message);
      return;
    }
    const text = writeBrainsModule(registrationsAfter(module.reading, files, batch).values());
    if (text !== module.text) {
      try {
        await this._files.write(BRAINS_MODULE_FILE, text);
      } catch (error) {
        this.failAll(batch, error, `writing ${BRAINS_MODULE_FILE}`);
        return;
      }
    }
    await Promise.all(batch.map((queued) => this.applySource(queued)));
  }

  /** Writes or deletes the source file of one queued brain, and answers every push asking for it. */
  private async applySource(queued: QueuedPush): Promise<void> {
    const { push } = queued;
    const file = brainSourceFile(push.op === "write" ? push.brain.id : push.brainId);
    try {
      if (push.op === "write") {
        await this._files.write(file, push.brain.source);
      } else {
        await this._files.delete(file).catch((error: unknown) => {
          if (!(error instanceof ProjfsError && error.code === "NOT_FOUND")) throw error;
        });
      }
    } catch (error) {
      this.failAll([queued], error, `saving ${file}`);
      return;
    }
    for (const request of queued.requests) request.ack();
  }

  /** Every queued push, removed from the queue. */
  private takeQueue(): QueuedPush[] {
    const batch = [...this._queue.values()];
    this._queue.clear();
    return batch;
  }

  /** Reads the brains module, logging each problem found; a project holding none reads as registering nothing. */
  private async readModule(): Promise<ModuleState> {
    const text = await this.readIfPresent(BRAINS_MODULE_FILE);
    if (text === undefined) return { text, reading: { format: undefined, entries: new Map(), problems: [] } };
    const reading = readBrainsModule(text);
    for (const problem of reading.problems) {
      const where = problem.line === undefined ? BRAINS_MODULE_FILE : `${BRAINS_MODULE_FILE} line ${problem.line}`;
      this._log.error(`${problem.code}: ${where} ${PROBLEM_EXPLANATIONS[problem.code]}`);
    }
    return { text, reading };
  }

  /** The source text of each brain `ids` names, in order, `undefined` for each the project does not hold. */
  private readSources(ids: readonly string[]): Promise<(string | undefined)[]> {
    return Promise.all(ids.map((id) => this.readIfPresent(brainSourceFile(id))));
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

  /** Fails every push `batch` carries for `error`, logging it once as met while `doing`. */
  private failAll(batch: readonly QueuedPush[], error: unknown, doing: string): void {
    const message = describeError(error);
    this._log.error(`${message} (${doing})`);
    for (const queued of batch) for (const request of queued.requests) request.fail(message);
  }

  /** Fails `request` for `error`, logging it as met while `doing`. */
  private refused(request: MakeCodeBrainsListRequest | MakeCodeBrainsPullRequest, error: unknown, doing: string): void {
    const message = describeError(error);
    this._log.error(`${message} (${doing})`);
    request.fail(message);
  }
}

/**
 * The registrations the brains module holds once `batch` is applied: every
 * readable registration of a brain whose source file `files` lists, then
 * each queued change -- a write registering its compiled form, or dropping
 * the registration when it carries none, and a removal dropping it.
 */
function registrationsAfter(
  reading: BrainsModuleReading,
  files: readonly string[],
  batch: readonly QueuedPush[]
): Map<string, CompiledBrainEntry> {
  const sources = new Set(files.flatMap((name) => brainIdOf(name) ?? []));
  const entries = new Map<string, CompiledBrainEntry>();
  for (const [id, entry] of reading.entries) {
    if (sources.has(id)) entries.set(id, entry);
  }
  for (const { push } of batch) {
    if (push.op === "remove") {
      entries.delete(push.brainId);
      continue;
    }
    const { id, name, compiled } = push.brain;
    if (compiled === undefined) entries.delete(id);
    else entries.set(id, { id, name, sourceHash: compiled.sourceHash, bytecode: compiled.bytecode });
  }
  return entries;
}

/** The id of the brain whose source file is `name`, or `undefined` when `name` is not a brain source file. */
function brainIdOf(name: string): string | undefined {
  if (!name.startsWith(SOURCE_FOLDER) || !name.endsWith(SOURCE_SUFFIX)) return undefined;
  const id = name.slice(SOURCE_FOLDER.length, name.length - SOURCE_SUFFIX.length);
  return id.length > 0 && !id.includes("/") ? id : undefined;
}

/**
 * The display name of a brain: the name its source document carries, else
 * the name its registration carries, else empty.
 */
function brainName(source: string, entry: CompiledBrainEntry | undefined): string {
  try {
    const document: unknown = JSON.parse(source);
    if (typeof document === "object" && document !== null) {
      const { name } = document as { name?: unknown };
      if (typeof name === "string") return name;
    }
  } catch {
    // Not a brain document; the registration names it.
  }
  return entry?.name ?? "";
}

/** `error` as the message of a failed request: a projfs refusal's code leading its message. */
function describeError(error: unknown): string {
  return error instanceof ProjfsError ? `${error.code}: ${error.message}` : String(error);
}
