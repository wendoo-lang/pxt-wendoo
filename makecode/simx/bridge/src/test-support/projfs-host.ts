import {
  PROJFS_MESSAGE_TYPE,
  ProjfsClient,
  type ProjfsErrorCode,
  type ProjfsFileInfo,
  type ProjfsListenerWindow,
  type ProjfsReply,
  type ProjfsRequest,
} from "../vendor/projfs.js";

/** The most UTF-8 bytes the files under one simulator extension's folder may hold, as MakeCode enforces it. */
export const PROJFS_SCOPE_QUOTA_BYTES = 512 * 1024;

/** The most writes and deletes one simulator extension may make within {@link PROJFS_RATE_WINDOW_MS}. */
export const PROJFS_RATE_LIMIT = 30;

/** The sliding window, in milliseconds, over which {@link PROJFS_RATE_LIMIT} applies. */
export const PROJFS_RATE_WINDOW_MS = 10000;

/** A reply without the `type` and `id` fields every reply carries. */
type ProjfsReplyBody<R = ProjfsReply> = R extends ProjfsReply ? Omit<R, "type" | "id"> : never;

/** The key MakeCode creates the Wendoo simulator extension's frame for, which names its folder. */
const SCOPE = "wendoo-lang/pxt-wendoo";

/** A refused request, carrying the code of its error reply. */
class RefusedRequest extends Error {
  constructor(
    readonly code: ProjfsErrorCode,
    message: string
  ) {
    super(message);
  }
}

/** Returns the size of `content` in UTF-8 bytes. */
function utf8Length(content: string): number {
  return new TextEncoder().encode(content).length;
}

/**
 * MakeCode's side of the project-file messages, played by a spec over an
 * in-memory project: it serves one simulator extension's folder by the rules
 * the MakeCode editor applies -- scope-relative names, visibility by the
 * pxt.json files list, writes that list their file, one request applied at a
 * time in arrival order, the per-folder quota, and the sliding-window limit
 * on writes and deletes, checked on arrival -- and replies through the
 * message events of the window it stands for.
 *
 * It also plays MakeCode's text editor sharing the project: a scope file
 * opened with {@link openInEditor} is shown from a buffer, which a write to
 * the file reloads, and which a switch to another file saves over the stored
 * file, as MakeCode saves the file it is leaving.
 *
 * Pass {@link parent} as a projfs client's target and the host itself as its
 * listener, or take a client from {@link client}.
 */
export class FakeProjfsHost {
  /** Every stored file of the project, by project-relative name. */
  readonly stored = new Map<string, string>();
  /** The project's pxt.json files list. */
  readonly listed: string[] = [];
  /** Every write and delete applied, in order, as `write <name>` or `delete <name>` with the scope-relative name. */
  readonly mutations: string[] = [];
  /** The window a simulator extension frame posts its requests to. */
  readonly parent = {
    postMessage: (message: unknown): void => {
      this.receive(message);
    },
  };
  /** The current time, in milliseconds, the rate limit reads. */
  now = 0;
  /** Whether a project is open; requests to a closed one fail with `FAILED`. */
  open = true;
  /**
   * Whether a write to the file open in the editor reloads the editor's
   * buffer, as MakeCode does. When false, the buffer keeps the text it
   * loaded, and the next file switch saves that text over the write.
   */
  reloadsOpenFile = true;
  private _openFile: string | undefined;
  private _buffer = "";
  private readonly _listeners = new Set<(event: { data: unknown; source: unknown }) => void>();
  private _recentMutations: number[] = [];
  private _queue: Promise<void> = Promise.resolve();
  private _held: (() => void) | undefined;
  private _heldGate: Promise<void> = Promise.resolve();

  addEventListener(_type: "message", listener: (event: { data: unknown; source: unknown }) => void): void {
    this._listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: (event: { data: unknown; source: unknown }) => void): void {
    this._listeners.delete(listener);
  }

  /** A projfs client served by this host, disposed by the caller. */
  client(): ProjfsClient {
    return new ProjfsClient({ target: this.parent, listener: this as unknown as ProjfsListenerWindow });
  }

  /** The content of the scope file `name`, or `undefined` when none is stored. */
  file(name: string): string | undefined {
    return this.stored.get(`${SCOPE}/${name}`);
  }

  /** Stores and lists the scope file `name`, as a person editing the project would; no mutation is recorded. */
  edit(name: string, content: string): void {
    const scoped = `${SCOPE}/${name}`;
    this.stored.set(scoped, content);
    if (!this.listed.includes(scoped)) this.listed.push(scoped);
    if (scoped === this._openFile) this._buffer = content;
  }

  /**
   * Switches MakeCode's text editor to the scope file `name`, which it shows
   * from its stored content. The file open until now is saved from the
   * editor's buffer first.
   */
  openInEditor(name: string): void {
    this.saveEditor();
    this._openFile = `${SCOPE}/${name}`;
    this._buffer = this.stored.get(this._openFile) ?? "";
  }

  /** Switches MakeCode's text editor to a file outside the folder, saving the open file from the editor's buffer first. */
  closeEditor(): void {
    this.saveEditor();
    this._openFile = undefined;
  }

  /** Deletes and unlists the scope file `name`, as a person editing the project would. */
  remove(name: string): void {
    const scoped = `${SCOPE}/${name}`;
    this.stored.delete(scoped);
    const index = this.listed.indexOf(scoped);
    if (index >= 0) this.listed.splice(index, 1);
  }

  /** Records `count` writes and deletes as made now, as earlier requests of the extension would have. */
  spendMutations(count: number): void {
    for (let i = 0; i < count; i++) this._recentMutations.push(this.now);
  }

  /** Stops applying requests: each one arriving from now on waits, in order, until {@link release}. */
  hold(): void {
    if (this._held) return;
    this._heldGate = new Promise((resolve) => {
      this._held = resolve;
    });
  }

  /** Applies the requests held since {@link hold}, in arrival order, and every later one at once. */
  release(): void {
    this._held?.();
    this._held = undefined;
  }

  /** Resolves once every request received so far has been answered. */
  settled(): Promise<void> {
    return this._queue;
  }

  private receive(message: unknown): void {
    const request = message as ProjfsRequest;
    if (request?.type !== PROJFS_MESSAGE_TYPE) return;
    const id = request.id;
    const mutates = request.subtype === "write" || request.subtype === "delete";
    if (mutates && !this.admitMutation()) {
      this.reply({
        type: PROJFS_MESSAGE_TYPE,
        id,
        subtype: "error",
        code: "RATE_LIMITED",
        message: `More than ${PROJFS_RATE_LIMIT} writes and deletes in ${PROJFS_RATE_WINDOW_MS / 1000} seconds.`,
      });
      return;
    }
    const gate = this._heldGate;
    this._queue = this._queue
      .then(() => gate)
      .then(() => this.apply(request))
      .then(
        (reply) => {
          this.reply({ ...reply, type: PROJFS_MESSAGE_TYPE, id } as ProjfsReply);
        },
        (error: unknown) => {
          const refused = error instanceof RefusedRequest ? error : new RefusedRequest("FAILED", String(error));
          this.reply({ type: PROJFS_MESSAGE_TYPE, id, subtype: "error", code: refused.code, message: refused.message });
        }
      );
  }

  /** Saves the editor's buffer over the open file, when one is open and still stored. */
  private saveEditor(): void {
    if (this._openFile !== undefined && this.stored.has(this._openFile)) this.stored.set(this._openFile, this._buffer);
  }

  private admitMutation(): boolean {
    this._recentMutations = this._recentMutations.filter((time) => this.now - time < PROJFS_RATE_WINDOW_MS);
    if (this._recentMutations.length >= PROJFS_RATE_LIMIT) return false;
    this._recentMutations.push(this.now);
    return true;
  }

  private reply(reply: ProjfsReply): void {
    const event = { data: reply, source: this.parent };
    setTimeout(() => {
      for (const listener of this._listeners) listener(event);
    }, 0);
  }

  private visibleFiles(): ProjfsFileInfo[] {
    const prefix = `${SCOPE}/`;
    return this.listed
      .filter((name) => name.startsWith(prefix) && this.stored.has(name))
      .map((name) => ({ name: name.slice(prefix.length), size: utf8Length(this.stored.get(name) ?? "") }));
  }

  private scopeUsage(): number {
    let total = 0;
    for (const [name, content] of this.stored) {
      if (name.startsWith(`${SCOPE}/`)) total += utf8Length(content);
    }
    return total;
  }

  private scoped(name: unknown): string {
    const valid =
      typeof name === "string" &&
      name.split(/[/\\]/).every((segment) => segment && segment !== "." && segment !== "..");
    if (!valid) throw new RefusedRequest("INVALID_NAME", `${String(name)} is not a valid relative file name.`);
    return `${SCOPE}/${name}`;
  }

  private async apply(request: ProjfsRequest): Promise<ProjfsReplyBody> {
    if (!this.open) throw new RefusedRequest("FAILED", "No project is open.");
    switch (request.subtype) {
      case "list":
        return { subtype: "files", files: this.visibleFiles() };
      case "read": {
        const scoped = this.scoped(request.name);
        if (!this.visibleFiles().some((file) => file.name === request.name)) {
          throw new RefusedRequest("NOT_FOUND", `${request.name} is not a file in ${SCOPE}/.`);
        }
        return { subtype: "content", name: request.name, content: this.stored.get(scoped) ?? "" };
      }
      case "write": {
        const scoped = this.scoped(request.name);
        const replaced = this.stored.has(scoped) ? utf8Length(this.stored.get(scoped) ?? "") : 0;
        const total = this.scopeUsage() - replaced + utf8Length(request.content);
        if (total > PROJFS_SCOPE_QUOTA_BYTES) {
          throw new RefusedRequest("QUOTA_EXCEEDED", `Writing ${scoped} would bring ${SCOPE}/ to ${total} bytes.`);
        }
        this.stored.set(scoped, request.content);
        if (!this.listed.includes(scoped)) this.listed.push(scoped);
        if (scoped === this._openFile && this.reloadsOpenFile) this._buffer = request.content;
        this.mutations.push(`write ${request.name}`);
        return { subtype: "ack", name: request.name };
      }
      case "delete": {
        const scoped = this.scoped(request.name);
        const index = this.listed.indexOf(scoped);
        if (!this.stored.has(scoped) && index < 0) throw new RefusedRequest("NOT_FOUND", `${scoped} does not exist.`);
        this.stored.delete(scoped);
        if (index >= 0) this.listed.splice(index, 1);
        this.mutations.push(`delete ${request.name}`);
        return { subtype: "ack", name: request.name };
      }
    }
  }
}
