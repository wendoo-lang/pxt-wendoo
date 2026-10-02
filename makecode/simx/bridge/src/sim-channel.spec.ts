import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { connectSimChannel, SIM_CHANNEL_VERSION, SIMX_CHANNEL, type SimxFrame } from "./sim-channel.js";
import { postedProgramUpdates } from "./test-support/program-update-frame.js";

/** The window of a simulator extension frame, recording what is posted and delivering what the program posts. */
class RecordingFrame implements SimxFrame {
  private readonly _listeners = new Set<(event: { data: unknown }) => void>();
  readonly posted: unknown[] = [];
  readonly parent = {
    postMessage: (message: unknown) => {
      this.posted.push(message);
    },
  };

  addEventListener(_type: "message", listener: (event: { data: unknown }) => void): void {
    this._listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: (event: { data: unknown }) => void): void {
    this._listeners.delete(listener);
  }

  /** MakeCode delivering a message the program posted on `channel`, `text` as its UTF-8 bytes. */
  programPostsText(text: string, channel = SIMX_CHANNEL): void {
    const packet = { type: "messagepacket", broadcast: true, channel, data: new TextEncoder().encode(text) };
    for (const listener of this._listeners) listener({ data: packet });
  }
}

/** Every byte value, in order: a program no text encoding could carry intact. */
const EVERY_BYTE = Uint8Array.from({ length: 256 }, (_, index) => index);

describe("sim channel program updates", () => {
  it("posts a program update to the program as one frame under the channel version, its bytes verbatim", () => {
    const frame = new RecordingFrame();
    const channel = connectSimChannel(frame);

    channel.postProgramUpdate({
      documentId: "abcdabcdabcdabcd",
      name: "Chaser é\n😀",
      sourceHash: "0a1b2c3d",
      bytecode: EVERY_BYTE,
    });

    assert.deepEqual(postedProgramUpdates(frame.posted), [
      {
        version: SIM_CHANNEL_VERSION,
        documentId: "abcdabcdabcdabcd",
        name: "Chaser é\n😀",
        sourceHash: "0a1b2c3d",
        bytecode: EVERY_BYTE,
      },
    ]);
  });

  it("posts a program large enough for any brain whole, in one message", () => {
    const frame = new RecordingFrame();
    const channel = connectSimChannel(frame);
    const large = Uint8Array.from({ length: 1 << 20 }, (_, index) => (index * 7) & 0xff);

    channel.postProgramUpdate({ documentId: "abcdabcdabcdabcd", name: "Big", sourceHash: "0a1b2c3d", bytecode: large });

    assert.equal(frame.posted.length, 1);
    assert.deepEqual(postedProgramUpdates(frame.posted)[0].bytecode, large);
  });

  it("posts a removal as an update carrying no program", () => {
    const frame = new RecordingFrame();
    const channel = connectSimChannel(frame);

    channel.postProgramUpdate({
      documentId: "abcdabcdabcdabcd",
      name: "",
      sourceHash: "",
      bytecode: new Uint8Array(0),
    });

    const [removal] = postedProgramUpdates(frame.posted);
    assert.equal(removal.documentId, "abcdabcdabcdabcd");
    assert.equal(removal.bytecode.length, 0);
  });

  it("posts program updates on the channel it was opened on", () => {
    const frame = new RecordingFrame();
    const channel = connectSimChannel(frame, "someone/else");

    channel.postProgramUpdate({ documentId: "abcdabcdabcdabcd", name: "", sourceHash: "", bytecode: EVERY_BYTE });

    assert.equal(postedProgramUpdates(frame.posted, "someone/else").length, 1);
    assert.equal(postedProgramUpdates(frame.posted).length, 0);
  });

  it("announces each program start, read from the program's ping, and nothing for a catalog", () => {
    const frame = new RecordingFrame();
    const channel = connectSimChannel(frame);
    let starts = 0;
    channel.onProgramStart(() => {
      starts++;
    });

    frame.programPostsText(`${SIM_CHANNEL_VERSION}\n`);
    frame.programPostsText(`${SIM_CHANNEL_VERSION}\n{}`);
    frame.programPostsText(`${SIM_CHANNEL_VERSION}\n`);

    assert.equal(starts, 2);
  });

  it("announces no program start for a ping it rejects", () => {
    const frame = new RecordingFrame();
    const channel = connectSimChannel(frame);
    let starts = 0;
    channel.onProgramStart(() => {
      starts++;
    });

    frame.programPostsText(`${SIM_CHANNEL_VERSION + 1}\n`);
    frame.programPostsText("\n");

    assert.equal(starts, 0);
  });
});
