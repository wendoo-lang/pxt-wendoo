import type { MakeCodeBrainPush } from "@wendoo/makecode-session";
import type { ProgramUpdate } from "./sim-channel.js";

/**
 * The live side of the editor's pushes: each push that changes what a
 * program runs becomes a program update for the running program, posted the
 * moment the push arrives.
 *
 * - A write carrying a compiled form posts it, unless the last update posted
 *   for that program carried a compiled form of the same source hash: a push
 *   whose source changed but whose compiled form did not posts nothing.
 * - A write carrying no compiled form posts nothing.
 * - A removal posts an update carrying no program, unless the last update
 *   posted for that program was a removal.
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
   * Post the program update `push` makes, if it changes what a program runs.
   *
   * @param push - A push from the editor, as it arrives.
   */
  push(push: MakeCodeBrainPush): void {
    let update: ProgramUpdate;
    if (push.op === "remove") {
      update = { documentId: push.brainId, name: "", sourceHash: "", bytecode: new Uint8Array(0) };
    } else {
      const { id, name, compiled } = push.brain;
      if (compiled === undefined) return;
      update = { documentId: id, name, sourceHash: compiled.sourceHash, bytecode: compiled.bytecode };
    }
    const last = this._posted.get(update.documentId);
    if (last !== undefined && last.sourceHash === update.sourceHash) return;
    this._posted.set(update.documentId, update);
    this._post(update);
  }

  /** Post again the last update posted for each program, in the order each program was first posted. */
  repost(): void {
    for (const update of this._posted.values()) {
      this._post(update);
    }
  }
}
