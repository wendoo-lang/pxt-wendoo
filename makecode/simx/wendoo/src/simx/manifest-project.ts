import type {
  MakeCodeManifestReadRequest,
  MakeCodeManifestRequest,
  MakeCodeManifestWriteRequest,
} from "@wendoo/makecode-session";
import { MakeCodeManifestProblemCode } from "@wendoo/makecode-session";
import { ProjfsError } from "../vendor/projfs.js";
import type { ProjectFiles } from "./brains-project.js";
import { IDS_MODULE_FILE, readIdsModule, writeIdsModule } from "./ids-module.js";
import type { SimxLog } from "./simx-bridge.js";

/** What the log says about the ids module for each problem code. */
const PROBLEM_EXPLANATIONS: Record<MakeCodeManifestProblemCode, string> = {
  [MakeCodeManifestProblemCode.UNREADABLE]:
    "declares no format this simulator extension reads; no id is served from it, and the next write replaces it.",
  [MakeCodeManifestProblemCode.FORMAT_NEWER]:
    "was written by a newer simulator extension; no id is served from it, and writes are refused so it is kept as it is.",
  [MakeCodeManifestProblemCode.ENTRY_MALFORMED]:
    "holds a line that does not follow the format; the rest is served, and the next write replaces it.",
};

/**
 * The MakeCode project's id manifest, as the party serving the project
 * answers manifest requests from it: the ids module at {@link IDS_MODULE_FILE}.
 * Everything served is read from the project's files at the time of the
 * request, so instances hold no ids of their own.
 *
 * - A read returns what the ids module declares: no manifest when the project
 *   holds none, and the module's coded problem when it is damaged or of a
 *   newer format.
 * - A write replaces the ids module with the editor's whole allocation,
 *   skipped when the text would not change, and is acknowledged once the
 *   module has landed. A module of a newer format is never replaced: the
 *   write fails, its code leading the message. A refused write fails with the
 *   refusal's projfs code leading the message. Every write is an artifact,
 *   never flagged as a user edit.
 *
 * Requests are answered one at a time, in arrival order, so a read answered
 * after a write reads what that write left. Each problem found reading the
 * module is written to the log by its code.
 */
export class ManifestProject {
  private readonly _files: ProjectFiles;
  private readonly _log: SimxLog;
  private _tail: Promise<void> = Promise.resolve();

  /**
   * @param files - The project's files, relative to the simulator extension's folder.
   * @param log - Receives a coded line for every refused request and every ids module problem.
   */
  constructor(files: ProjectFiles, log: SimxLog) {
    this._files = files;
    this._log = log;
  }

  /**
   * Answer `request` from the project's files, once every request received
   * before it has been answered. A request that cannot be handled at all --
   * a write carrying no manifest the ids module can declare -- fails with the
   * reason, and later requests are answered as usual.
   *
   * @param request - A manifest request from the editor.
   */
  serve(request: MakeCodeManifestRequest): void {
    this._tail = this._tail
      .then(() => (request.kind === "read" ? this.read(request) : this.write(request)))
      .catch((error: unknown) => {
        this.refused(request, error, "answering a manifest request");
      });
  }

  private async read(request: MakeCodeManifestReadRequest): Promise<void> {
    let text: string | undefined;
    try {
      text = await this.readIfPresent();
    } catch (error) {
      this.refused(request, error, "reading the ids");
      return;
    }
    request.reply(text === undefined ? { manifest: null } : this.readModule(text));
  }

  private async write(request: MakeCodeManifestWriteRequest): Promise<void> {
    let current: string | undefined;
    try {
      current = await this.readIfPresent();
    } catch (error) {
      this.refused(request, error, `reading ${IDS_MODULE_FILE} before writing it`);
      return;
    }
    if (current !== undefined && this.readModule(current).problem === MakeCodeManifestProblemCode.FORMAT_NEWER) {
      const code = MakeCodeManifestProblemCode.FORMAT_NEWER;
      request.fail(`${code}: ${IDS_MODULE_FILE} ${PROBLEM_EXPLANATIONS[code]}`);
      return;
    }
    const text = writeIdsModule(request.manifest);
    if (text !== current) {
      try {
        await this._files.write(IDS_MODULE_FILE, text);
      } catch (error) {
        this.refused(request, error, `writing ${IDS_MODULE_FILE}`);
        return;
      }
    }
    request.ack();
  }

  /** What `text` declares, its problem logged by code. */
  private readModule(text: string): ReturnType<typeof readIdsModule> {
    const reading = readIdsModule(text);
    if (reading.problem !== undefined) {
      this._log.error(`${reading.problem}: ${IDS_MODULE_FILE} ${PROBLEM_EXPLANATIONS[reading.problem]}`);
    }
    return reading;
  }

  /** The ids module's text, or `undefined` when the project holds none. */
  private async readIfPresent(): Promise<string | undefined> {
    try {
      return await this._files.read(IDS_MODULE_FILE);
    } catch (error) {
      if (error instanceof ProjfsError && error.code === "NOT_FOUND") return undefined;
      throw error;
    }
  }

  /** Fails `request` for `error`, logging it as met while `doing`. */
  private refused(request: MakeCodeManifestRequest, error: unknown, doing: string): void {
    const message = error instanceof ProjfsError ? `${error.code}: ${error.message}` : String(error);
    this._log.error(`${message} (${doing})`);
    request.fail(message);
  }
}
