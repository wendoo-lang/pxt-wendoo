import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CompiledBrain } from "./brains-module.js";
import { LivePrograms } from "./live-programs.js";
import type { ProgramUpdate } from "./sim-channel.js";

/** The registration of the brain `id` named `name`, its program `bytes` compiled from source hashed `sourceHash`. */
function registration(id: string, name: string, sourceHash: string, bytes: number[] = [1, 2, 3]): CompiledBrain {
  return { id, name, sourceHash, bytecode: Uint8Array.from(bytes) };
}

/** Live programs posting into an array, with the array. */
function recording(): { live: LivePrograms; posted: ProgramUpdate[] } {
  const posted: ProgramUpdate[] = [];
  const live = new LivePrograms((update) => {
    posted.push(update);
  });
  return { live, posted };
}

const A = "aaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbb";

describe("live programs", () => {
  it("posts a registration's program, by id, name, bytes, and source hash", () => {
    const { live, posted } = recording();

    live.post(registration(A, "Chaser", "00000001", [9, 8, 7]));

    assert.deepEqual(posted, [
      { documentId: A, name: "Chaser", sourceHash: "00000001", bytecode: Uint8Array.from([9, 8, 7]) },
    ]);
  });

  it("posts each registration compiled from other source than the last it posted", () => {
    const { live, posted } = recording();

    live.post(registration(A, "Chaser", "00000001"));
    live.post(registration(A, "Chaser", "00000002"));
    live.post(registration(A, "Chaser", "00000001"));

    assert.deepEqual(
      posted.map((update) => update.sourceHash),
      ["00000001", "00000002", "00000001"]
    );
  });

  it("posts nothing for a registration carrying the program it posted last, though its name changed", () => {
    const { live, posted } = recording();

    live.post(registration(A, "Chaser", "00000001"));
    live.post(registration(A, "Runner", "00000001"));

    assert.equal(posted.length, 1);
  });

  it("posts a registration of the same source compiled to other bytes than it posted last", () => {
    const { live, posted } = recording();

    live.post(registration(A, "Chaser", "00000001", [1, 2, 3]));
    live.post(registration(A, "Chaser", "00000001", [1, 2, 4]));
    live.post(registration(A, "Chaser", "00000001", [1, 2, 4, 5]));

    assert.deepEqual(
      posted.map((update) => [...update.bytecode]),
      [
        [1, 2, 3],
        [1, 2, 4],
        [1, 2, 4, 5],
      ]
    );
  });

  it("keeps each program's last post apart: one program's registration says nothing about another's", () => {
    const { live, posted } = recording();

    live.post(registration(A, "Chaser", "00000001"));
    live.post(registration(B, "Runner", "00000001"));
    live.post(registration(A, "Chaser", "00000001"));

    assert.deepEqual(
      posted.map((update) => update.documentId),
      [A, B]
    );
  });

  it("posts a removal as an update carrying no program, once, and the program again when it returns", () => {
    const { live, posted } = recording();

    live.post(registration(A, "Chaser", "00000001"));
    live.remove(A);
    live.remove(A);
    live.post(registration(A, "Chaser", "00000001"));

    assert.deepEqual(posted, [
      { documentId: A, name: "Chaser", sourceHash: "00000001", bytecode: Uint8Array.from([1, 2, 3]) },
      { documentId: A, name: "", sourceHash: "", bytecode: new Uint8Array(0) },
      { documentId: A, name: "Chaser", sourceHash: "00000001", bytecode: Uint8Array.from([1, 2, 3]) },
    ]);
  });

  it("posts a removal of a program it never posted, which the running program may hold", () => {
    const { live, posted } = recording();

    live.remove(A);

    assert.deepEqual(posted, [{ documentId: A, name: "", sourceHash: "", bytecode: new Uint8Array(0) }]);
  });

  it("re-posts the last update of every program on request, in the order each was first posted", () => {
    const { live, posted } = recording();
    live.post(registration(A, "Chaser", "00000001"));
    live.post(registration(B, "Runner", "00000002"));
    live.post(registration(A, "Chaser", "00000003"));
    posted.length = 0;

    live.repost();

    assert.deepEqual(
      posted.map((update) => [update.documentId, update.sourceHash]),
      [
        [A, "00000003"],
        [B, "00000002"],
      ]
    );
  });

  it("re-posts nothing before any post", () => {
    const { live, posted } = recording();

    live.repost();

    assert.deepEqual(posted, []);
  });
});
