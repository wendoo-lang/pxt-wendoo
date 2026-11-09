import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SIMXEDITOR_MESSAGE_TYPE, type SimxEditorTab } from "../vendor/simxeditor.js";
import { connectEditorTabOpener, type EditorTabFrame } from "./editor-tab.js";
import { SIMX_CHANNEL } from "./sim-channel.js";

/** The origin MakeCode names in the frame URL in these specs. */
const PARENT_ORIGIN = "https://arcade.makecode.com";

/** The key of an editor tab whose registration names this simulator extension's frame as its own. */
const DESIGNER_TAB = "owner/repo-designer";

/** Every refusal code MakeCode answers a simxeditor request with. */
const REFUSAL_CODES = ["UNREGISTERED", "PERMISSION_DENIED", "UNAVAILABLE", "INVALID_REQUEST"];

/** A simulator extension frame driven by the spec in place of MakeCode. */
class FakeFrame implements EditorTabFrame {
  private readonly _listeners = new Set<(event: { data: unknown; source: unknown }) => void>();
  /** Every message posted to MakeCode, with the origin it was posted to. */
  readonly posted: { message: unknown; targetOrigin: string }[] = [];
  readonly parent = {
    postMessage: (message: unknown, targetOrigin: string): void => {
      this.posted.push({ message, targetOrigin });
    },
  };

  addEventListener(_type: "message", listener: (event: { data: unknown; source: unknown }) => void): void {
    this._listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: (event: { data: unknown; source: unknown }) => void): void {
    this._listeners.delete(listener);
  }

  /** Delivers `data` as a message posted by `source`, MakeCode's window by default. */
  receive(data: unknown, source: unknown = this.parent): void {
    for (const listener of this._listeners) listener({ data, source });
  }

  /** The id of the request posted at `index`. */
  requestId(index: number): string {
    return (this.posted[index].message as { id: string }).id;
  }
}

/** A log recording its error lines. */
function recordingLog(): { errors: string[]; info(): void; error(message: string): void } {
  const errors: string[] = [];
  return {
    errors,
    info() {},
    error(message) {
      errors.push(message);
    },
  };
}

describe("editor tab opener", () => {
  it("posts an open request carrying a fresh id to MakeCode's origin", () => {
    const frame = new FakeFrame();
    const opener = connectEditorTabOpener(frame, PARENT_ORIGIN, recordingLog());

    void opener.open();
    void opener.open();

    assert.equal(frame.posted.length, 2);
    for (const { message, targetOrigin } of frame.posted) {
      assert.equal(targetOrigin, PARENT_ORIGIN);
      assert.equal((message as { type: string }).type, SIMXEDITOR_MESSAGE_TYPE);
      assert.equal((message as { subtype: string }).subtype, "open");
    }
    assert.notEqual(frame.requestId(0), frame.requestId(1));
    opener.dispose();
  });

  it("posts an open request naming the tab's key when given one, and naming none when not", () => {
    const frame = new FakeFrame();
    const opener = connectEditorTabOpener(frame, PARENT_ORIGIN, recordingLog());

    void opener.open(DESIGNER_TAB);
    void opener.open();

    assert.deepEqual(frame.posted[0].message, {
      type: SIMXEDITOR_MESSAGE_TYPE,
      subtype: "open",
      id: frame.requestId(0),
      key: DESIGNER_TAB,
    });
    assert.deepEqual(frame.posted[1].message, {
      type: SIMXEDITOR_MESSAGE_TYPE,
      subtype: "open",
      id: frame.requestId(1),
    });
    opener.dispose();
  });

  it("resolves with true on MakeCode's acknowledgment, logging nothing", async () => {
    const frame = new FakeFrame();
    const log = recordingLog();
    const opener = connectEditorTabOpener(frame, PARENT_ORIGIN, log);
    const opened = opener.open();

    frame.receive({ type: SIMXEDITOR_MESSAGE_TYPE, id: frame.requestId(0), subtype: "ack" });

    assert.equal(await opened, true);
    assert.deepEqual(log.errors, []);
    opener.dispose();
  });

  it("resolves with false on a refusal, logging its code", async () => {
    for (const code of REFUSAL_CODES) {
      const frame = new FakeFrame();
      const log = recordingLog();
      const opener = connectEditorTabOpener(frame, PARENT_ORIGIN, log);
      const opened = opener.open();

      frame.receive({ type: SIMXEDITOR_MESSAGE_TYPE, id: frame.requestId(0), subtype: "error", code, message: "" });

      assert.equal(await opened, false);
      assert.equal(log.errors.length, 1);
      assert.ok(log.errors[0].startsWith(`${code}:`));
      opener.dispose();
    }
  });

  it("settles a request only on a reply from MakeCode's window carrying its id", async () => {
    const frame = new FakeFrame();
    const log = recordingLog();
    const opener = connectEditorTabOpener(frame, PARENT_ORIGIN, log);
    let settled = false;
    const opened = opener.open().then(() => {
      settled = true;
    });
    const id = frame.requestId(0);

    frame.receive({ type: SIMXEDITOR_MESSAGE_TYPE, id, subtype: "error", code: "UNAVAILABLE", message: "" }, {});
    frame.receive({ type: SIMXEDITOR_MESSAGE_TYPE, id: `${id}-other`, subtype: "ack" });
    frame.receive({ type: "projfs", id, subtype: "ack" });
    await Promise.resolve();
    assert.equal(settled, false);

    frame.receive({ type: SIMXEDITOR_MESSAGE_TYPE, id, subtype: "ack" });
    await opened;
    assert.equal(settled, true);
    assert.deepEqual(log.errors, []);
    opener.dispose();
  });

  it("posts a tabs request carrying a fresh id to MakeCode's origin", () => {
    const frame = new FakeFrame();
    const opener = connectEditorTabOpener(frame, PARENT_ORIGIN, recordingLog());

    void opener.tabs();
    void opener.open();

    assert.deepEqual(frame.posted[0], {
      message: { type: SIMXEDITOR_MESSAGE_TYPE, subtype: "tabs", id: frame.requestId(0) },
      targetOrigin: PARENT_ORIGIN,
    });
    assert.notEqual(frame.requestId(0), frame.requestId(1));
    opener.dispose();
  });

  it("resolves a tabs request with the tabs MakeCode lists, in order, on the reply carrying its id", async () => {
    const frame = new FakeFrame();
    const log = recordingLog();
    const opener = connectEditorTabOpener(frame, PARENT_ORIGIN, log);
    let settled = false;
    const listed = opener.tabs().finally(() => {
      settled = true;
    });
    const id = frame.requestId(0);
    const elsewhere: SimxEditorTab[] = [{ key: "elsewhere", label: "Elsewhere" }];
    const listedTabs: SimxEditorTab[] = [
      { key: SIMX_CHANNEL, label: "Wendoo", iconUrl: "https://example.com/wendoo-mark-small.svg" },
      { key: DESIGNER_TAB, label: "Designer" },
    ];

    frame.receive({ type: SIMXEDITOR_MESSAGE_TYPE, id: `${id}-other`, subtype: "tabs", tabs: elsewhere });
    frame.receive({ type: SIMXEDITOR_MESSAGE_TYPE, id, subtype: "tabs", tabs: elsewhere }, {});
    await Promise.resolve();
    assert.equal(settled, false);

    frame.receive({ type: SIMXEDITOR_MESSAGE_TYPE, id, subtype: "tabs", tabs: listedTabs });
    const tabs = await listed;
    assert.deepEqual(tabs, listedTabs);
    assert.equal(tabs[0].iconUrl, "https://example.com/wendoo-mark-small.svg");
    assert.equal("iconUrl" in tabs[1], false);
    assert.deepEqual(log.errors, []);
    opener.dispose();
  });

  it("resolves a refused tabs request with no tabs, logging its code", async () => {
    for (const code of REFUSAL_CODES) {
      const frame = new FakeFrame();
      const log = recordingLog();
      const opener = connectEditorTabOpener(frame, PARENT_ORIGIN, log);
      const listed = opener.tabs();

      frame.receive({ type: SIMXEDITOR_MESSAGE_TYPE, id: frame.requestId(0), subtype: "error", code, message: "" });

      assert.deepEqual(await listed, []);
      assert.equal(log.errors.length, 1);
      assert.ok(log.errors[0].startsWith(`${code}:`));
      opener.dispose();
    }
  });

  it("hears no reply once disposed", async () => {
    const frame = new FakeFrame();
    const log = recordingLog();
    const opener = connectEditorTabOpener(frame, PARENT_ORIGIN, log);
    void opener.open();
    const id = frame.requestId(0);

    opener.dispose();
    frame.receive({ type: SIMXEDITOR_MESSAGE_TYPE, id, subtype: "error", code: "UNAVAILABLE", message: "" });

    assert.deepEqual(log.errors, []);
  });
});
