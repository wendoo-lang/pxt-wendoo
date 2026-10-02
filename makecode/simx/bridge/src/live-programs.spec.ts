import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MakeCodeBrainPush } from "@wendoo/makecode-session";
import { LivePrograms } from "./live-programs.js";
import type { ProgramUpdate } from "./sim-channel.js";

/** A write push of the brain `id`, compiled to `bytes` from source hashed `sourceHash`, or uncompiled when `sourceHash` is omitted. */
function write(id: string, name: string, sourceHash?: string, bytes: number[] = [1, 2, 3]): MakeCodeBrainPush {
  const source = `{"id":"${id}","name":"${name}","edit":${Math.random()}}`;
  return {
    op: "write",
    brain:
      sourceHash === undefined
        ? { id, name, source }
        : { id, name, source, compiled: { bytecode: Uint8Array.from(bytes), sourceHash } },
  };
}

/** A removal push of the brain `id`. */
function remove(id: string): MakeCodeBrainPush {
  return { op: "remove", brainId: id };
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
  it("posts a pushed program's compiled form, by id, name, bytes, and source hash", () => {
    const { live, posted } = recording();

    live.push(write(A, "Chaser", "00000001", [9, 8, 7]));

    assert.deepEqual(posted, [
      { documentId: A, name: "Chaser", sourceHash: "00000001", bytecode: Uint8Array.from([9, 8, 7]) },
    ]);
  });

  it("posts each push whose compiled form was compiled from other source than the last it posted", () => {
    const { live, posted } = recording();

    live.push(write(A, "Chaser", "00000001"));
    live.push(write(A, "Chaser", "00000002"));
    live.push(write(A, "Chaser", "00000001"));

    assert.deepEqual(
      posted.map((update) => update.sourceHash),
      ["00000001", "00000002", "00000001"]
    );
  });

  it("posts nothing for a push carrying the compiled form it posted last, though the source changed", () => {
    const { live, posted } = recording();

    live.push(write(A, "Chaser", "00000001"));
    live.push(write(A, "Chaser", "00000001"));
    live.push(write(A, "Renamed", "00000001"));

    assert.equal(posted.length, 1);
  });

  it("posts nothing for a push carrying no compiled form", () => {
    const { live, posted } = recording();

    live.push(write(A, "Half built"));

    assert.deepEqual(posted, []);
  });

  it("keeps each program's last post apart: one program's push says nothing about another's", () => {
    const { live, posted } = recording();

    live.push(write(A, "Chaser", "00000001"));
    live.push(write(B, "Runner", "00000001"));
    live.push(write(B, "Runner", "00000001"));

    assert.deepEqual(
      posted.map((update) => update.documentId),
      [A, B]
    );
  });

  it("posts a removal as an update carrying no program, once, and the program again when it returns", () => {
    const { live, posted } = recording();

    live.push(write(A, "Chaser", "00000001"));
    live.push(remove(A));
    live.push(remove(A));
    live.push(write(A, "Chaser", "00000001"));

    assert.deepEqual(posted.slice(1), [
      { documentId: A, name: "", sourceHash: "", bytecode: new Uint8Array(0) },
      { documentId: A, name: "Chaser", sourceHash: "00000001", bytecode: Uint8Array.from([1, 2, 3]) },
    ]);
  });

  it("posts a removal of a program it never posted, which the running program may hold", () => {
    const { live, posted } = recording();

    live.push(remove(A));

    assert.deepEqual(posted, [{ documentId: A, name: "", sourceHash: "", bytecode: new Uint8Array(0) }]);
  });

  it("re-posts the last update of every program on request, in the order each was first posted", () => {
    const { live, posted } = recording();
    live.push(write(A, "Chaser", "00000001"));
    live.push(write(B, "Runner", "00000002"));
    live.push(write(A, "Chaser", "00000003"));
    live.push(remove(B));
    posted.length = 0;

    live.repost();

    assert.deepEqual(posted, [
      { documentId: A, name: "Chaser", sourceHash: "00000003", bytecode: Uint8Array.from([1, 2, 3]) },
      { documentId: B, name: "", sourceHash: "", bytecode: new Uint8Array(0) },
    ]);
  });

  it("re-posts nothing before any push", () => {
    const { live, posted } = recording();

    live.repost();

    assert.deepEqual(posted, []);
  });
});
