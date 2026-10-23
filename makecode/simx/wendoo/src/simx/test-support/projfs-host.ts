import {
  PROJFS_MESSAGE_TYPE,
  ProjfsClient,
  type ProjfsClientOptions,
  type ProjfsErrorCode,
  type ProjfsFileInfo,
  type ProjfsListenerWindow,
  type ProjfsReply,
  type ProjfsRequest,
} from "../../vendor/projfs.js";

/** The most UTF-8 bytes the files under one simulator extension's folder may hold, as MakeCode enforces it. */
export const PROJFS_SCOPE_QUOTA_BYTES = 512 * 1024;

/**
 * The most writes and deletes of one simulator extension that apply within
 * {@link PROJFS_RATE_WINDOW_MS}; MakeCode holds later ones until the window
 * allows them.
 */
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
 * time in arrival order and answered once it has applied, the per-folder
 * quota, the sliding-window rate on writes and deletes, over which a write or
 * delete waits, holding the requests behind it, until the window allows it,
 * each request bound to the project open when it arrived and refused with
 * `PROJECT_CLOSED` once that project has closed, and `UNREGISTERED` answers
 * to a frame MakeCode does not serve -- and replies through the message
 * events of the window it stands for. The time the rate window reads is
 * {@link now}, which only a spec moves.
 *
 * It also plays MakeCode's text editor sharing the project: a scope file
 * opened with {@link openInEditor} is shown from a buffer, which a write to
 * the file reloads, which a switch to another file saves over the stored
 * file, as MakeCode saves the file it is leaving, and which typing saves
 * after a debounce. A write to the open file is answered once the editor has
 * reloaded it, and saves of typing wait for that reload.
 *
 * Each `false` switch -- {@link defersOverRate}, {@link bindsRequestsToProject},
 * {@link answersUnregistered}, {@link reloadsOpenFile},
 * {@link holdsSavesDuringReload} -- plays a MakeCode lacking that rule, for
 * specs proving that a rule is what their outcome rests on.
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
  /** Whether a project is open; requests to a closed one are refused with `PROJECT_CLOSED`. */
  open = true;
  /** Whether MakeCode serves the requesting frame; when false, requests are answered `UNREGISTERED`. */
  registered = true;
  /**
   * Whether writes and deletes over the rate wait for the window. When false,
   * they are refused on arrival with `RATE_LIMITED`, unapplied.
   */
  defersOverRate = true;
  /**
   * Whether a request applies only to the project open when it arrived. When
   * false, a request applies to whichever project is open at its turn.
   */
  bindsRequestsToProject = true;
  /**
   * Whether a request from a frame MakeCode does not serve is answered. When
   * false, it is dropped unanswered.
   */
  answersUnregistered = true;
  /**
   * Whether a write to the file open in the editor reloads the editor's
   * buffer, as MakeCode does. When false, the buffer keeps the text it
   * loaded, and the next save from it writes that text over the write.
   */
  reloadsOpenFile = true;
  /**
   * How long, in milliseconds, the editor takes to reload a file a write
   * changed; 0 reloads it at once.
   */
  reloadDelayMs = 0;
  /**
   * Whether a write to the open file is answered only once the editor has
   * reloaded it, with saves of typing waiting for the reload. When false, the
   * write is answered before the reload, and a save of typing made before the
   * write can land over it.
   */
  holdsSavesDuringReload = true;
  private _now = 0;
  private _openFile: string | undefined;
  private _buffer = "";
  private _reloading: Promise<void> | undefined;
  private _typingSave: ReturnType<typeof setTimeout> | undefined;
  private _project = 0;
  private readonly _listeners = new Set<(event: { data: unknown; source: unknown }) => void>();
  private _recentMutations: number[] = [];
  private _windowWaiters: { at: number; resolve: () => void }[] = [];
  private _queue: Promise<void> = Promise.resolve();
  private _held: (() => void) | undefined;
  private _heldGate: Promise<void> = Promise.resolve();

  /** The current time, in milliseconds, the rate window reads; moving it forward lets held writes and deletes apply. */
  get now(): number {
    return this._now;
  }

  set now(time: number) {
    this._now = time;
    const due = this._windowWaiters.filter((waiter) => waiter.at <= time);
    this._windowWaiters = this._windowWaiters.filter((waiter) => waiter.at > time);
    for (const waiter of due) waiter.resolve();
  }

  addEventListener(_type: "message", listener: (event: { data: unknown; source: unknown }) => void): void {
    this._listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: (event: { data: unknown; source: unknown }) => void): void {
    this._listeners.delete(listener);
  }

  /**
   * A projfs client served by this host, disposed by the caller.
   *
   * @param options - How the client reports replies slower than its threshold.
   */
  client(options: Pick<ProjfsClientOptions, "slowReplyMs" | "onSlowReply"> = {}): ProjfsClient {
    return new ProjfsClient({
      ...options,
      target: this.parent,
      listener: this as unknown as ProjfsListenerWindow,
      search: "",
    });
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

  /**
   * Types `text` over the editor's buffer, as a person would, and saves the
   * buffer over the open file once `debounceMs` pass without more typing,
   * waiting first for a reload of the file in progress.
   */
  typeInEditor(text: string, debounceMs: number): void {
    this._buffer = text;
    clearTimeout(this._typingSave);
    this._typingSave = setTimeout(() => void this.saveTyping(), debounceMs);
  }

  /** Deletes and unlists the scope file `name`, as a person editing the project would. */
  remove(name: string): void {
    const scoped = `${SCOPE}/${name}`;
    this.stored.delete(scoped);
    const index = this.listed.indexOf(scoped);
    if (index >= 0) this.listed.splice(index, 1);
  }

  /**
   * Opens another project in MakeCode's tab, holding none of this one's
   * files; requests that arrived before the switch belong to the closed
   * project.
   */
  switchProject(): void {
    this._project += 1;
    this.stored.clear();
    this.listed.length = 0;
    this._openFile = undefined;
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
    const refuse = (code: ProjfsErrorCode, text: string): void => {
      this.reply({ type: PROJFS_MESSAGE_TYPE, id, subtype: "error", code, message: text });
    };
    if (!this.registered) {
      if (this.answersUnregistered) refuse("UNREGISTERED", "MakeCode does not serve this frame.");
      return;
    }
    const mutates = request.subtype === "write" || request.subtype === "delete";
    if (mutates && !this.defersOverRate && !this.admitMutation()) {
      refuse(
        "RATE_LIMITED",
        `More than ${PROJFS_RATE_LIMIT} writes and deletes in ${PROJFS_RATE_WINDOW_MS / 1000} seconds.`
      );
      return;
    }
    const project = this.open ? this._project : undefined;
    const gate = this._heldGate;
    this._queue = this._queue
      .then(() => gate)
      .then(async () => {
        if (mutates && this.defersOverRate) await this.admitMutationWhenAllowed(project);
        return this.apply(request, project);
      })
      .then(
        (reply) => {
          this.reply({ ...reply, type: PROJFS_MESSAGE_TYPE, id } as ProjfsReply);
        },
        (error: unknown) => {
          const refused = error instanceof RefusedRequest ? error : new RefusedRequest("FAILED", String(error));
          refuse(refused.code, refused.message);
        }
      );
  }

  /** Saves the editor's buffer over the open file, when one is open and still stored. */
  private saveEditor(): void {
    if (this._openFile !== undefined && this.stored.has(this._openFile)) this.stored.set(this._openFile, this._buffer);
  }

  /** Saves the typed buffer over the file it was typed in, once no reload of it is in progress. */
  private async saveTyping(): Promise<void> {
    const typedIn = this._openFile;
    if (this.holdsSavesDuringReload) {
      while (this._reloading !== undefined) await this._reloading;
    }
    if (typedIn === this._openFile) this.saveEditor();
  }

  /** Shows `content` in the editor's buffer, now or after {@link reloadDelayMs}; resolves once a write may be answered. */
  private async reloadEditor(content: string): Promise<void> {
    if (this.reloadDelayMs === 0) {
      this._buffer = content;
      return;
    }
    const reloaded = new Promise<void>((resolve) => {
      setTimeout(() => {
        this._buffer = content;
        resolve();
      }, this.reloadDelayMs);
    });
    if (!this.holdsSavesDuringReload) return;
    const reloading = reloaded.then(() => {
      if (this._reloading === reloading) this._reloading = undefined;
    });
    this._reloading = reloading;
    await reloading;
  }

  private admitMutation(): boolean {
    this._recentMutations = this._recentMutations.filter((time) => this.now - time < PROJFS_RATE_WINDOW_MS);
    if (this._recentMutations.length >= PROJFS_RATE_LIMIT) return false;
    this._recentMutations.push(this.now);
    return true;
  }

  /** Resolves once the rate window allows another write or delete, counting it from then. */
  private async admitMutationWhenAllowed(project: number | undefined): Promise<void> {
    while (!this.admitMutation()) {
      this.checkProject(project);
      const at = (this._recentMutations[0] ?? this.now) + PROJFS_RATE_WINDOW_MS;
      await new Promise<void>((resolve) => this._windowWaiters.push({ at, resolve }));
    }
  }

  /** Refuses with `PROJECT_CLOSED` when no project is open, or when `project`, the one a request arrived in, has closed. */
  private checkProject(project: number | undefined): void {
    if (!this.open) throw new RefusedRequest("PROJECT_CLOSED", "No project is open.");
    if (this.bindsRequestsToProject && project !== this._project) {
      throw new RefusedRequest("PROJECT_CLOSED", "The project open when the request arrived has closed.");
    }
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

  private async apply(request: ProjfsRequest, project: number | undefined): Promise<ProjfsReplyBody> {
    this.checkProject(project);
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
        this.mutations.push(`write ${request.name}`);
        if (scoped === this._openFile && this.reloadsOpenFile) await this.reloadEditor(request.content);
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
      case "subscribe":
        // acknowledged as MakeCode does; this host sends no change notifications
        return { subtype: "ack" };
    }
  }
}
