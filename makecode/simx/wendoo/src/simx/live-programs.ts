import type { CompiledBrain } from "./brains-module.js";
import type { ProgramUpdate } from "./sim-channel.js";

/**
 * The live side of the simulator extension's compiles: each change to what
 * a brain's registration holds becomes a program update for the running
 * program, posted the moment the compile makes it.
 *
 * - {@link post} posts a registration, unless the last update posted for
 *   that program carried the same program -- the same bytes compiled from
 *   the same source hash: a registration kept under another name posts
 *   nothing, and the same source compiled to other bytes posts them.
 * - {@link remove} posts an update carrying no program, unless the last
 *   update posted for that program was a removal.
 *
 * The last update posted for each program is kept, so {@link repost} can
 * post them again when the program starts anew.
 */
export class LivePrograms {
  private readonly _post: (update: ProgramUpdate) => void;
  private readonly _posted = new Map<string, ProgramUpdate>();

  /**
   * @param post - Posts one program update to the running program.
   */
  constructor(post: (update: ProgramUpdate) => void) {
    this._post = post;
  }

  /**
   * Post `registration`'s program, if it changes what its program runs.
   *
   * @param registration - A brain's registration, as a compile made it.
   */
  post(registration: CompiledBrain): void {
    const { id, name, sourceHash, bytecode } = registration;
    this.send({ documentId: id, name, sourceHash, bytecode });
  }

  /**
   * Post the removal of the program `documentId`, unless the last update
   * posted for it was one.
   *
   * @param documentId - The removed brain's document id.
   */
  remove(documentId: string): void {
    this.send({ documentId, name: "", sourceHash: "", bytecode: new Uint8Array(0) });
  }

  /** Post again the last update posted for each program, in the order each program was first posted. */
  repost(): void {
    for (const update of this._posted.values()) {
      this._post(update);
    }
  }

  /** Posts `update` unless the last update posted for its program carried the same program. */
  private send(update: ProgramUpdate): void {
    const last = this._posted.get(update.documentId);
    if (last !== undefined && sameProgram(last, update)) return;
    this._posted.set(update.documentId, update);
    this._post(update);
  }
}

/** Whether `a` and `b` carry the same program: the same bytes, compiled from the same source hash. */
function sameProgram(a: ProgramUpdate, b: ProgramUpdate): boolean {
  if (a.sourceHash !== b.sourceHash || a.bytecode.length !== b.bytecode.length) return false;
  return a.bytecode.every((byte, index) => byte === b.bytecode[index]);
}
