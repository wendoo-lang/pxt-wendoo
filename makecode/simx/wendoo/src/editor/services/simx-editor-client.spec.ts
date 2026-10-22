import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MakeCodeMessagePort } from "@wendoo/makecode-session";
import type { SimxEditorEvent } from "../../vendor/simxeditor.js";
import type { EditorRequest } from "./editor-requests.js";
import {
  connectSimxEditorClient,
  forwardTabActions,
  readParentOrigin,
  type SimxEditorClientEvent,
  type SimxEditorClientFrame,
} from "./simx-editor-client.js";

/** The origin MakeCode names in the frame URL in these specs. */
const PARENT_ORIGIN = "https://arcade.makecode.com";

/** An editor tab frame driven by the spec in place of MakeCode. */
class FakeTabFrame implements SimxEditorClientFrame {
  private readonly _listeners = new Set<(event: SimxEditorClientEvent) => void>();
  /** Every message posted to MakeCode, with the origin it was posted to. */
  readonly posted: { message: unknown; targetOrigin: string }[] = [];
  readonly parent = {
    postMessage: (message: unknown, targetOrigin: string): void => {
      this.posted.push({ message, targetOrigin });
    },
  };

  addEventListener(_type: "message", listener: (event: SimxEditorClientEvent) => void): void {
    this._listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: (event: SimxEditorClientEvent) => void): void {
    this._listeners.delete(listener);
  }

  /** Delivers `data` as posted from `origin`, transferring `ports`. */
  receive(data: unknown, ports: MakeCodeMessagePort[] = [], origin = PARENT_ORIGIN): void {
    for (const listener of this._listeners) listener({ data, origin, ports });
  }
}

/** A stand-in for a transferred port, compared by identity. */
function fakePort(): MakeCodeMessagePort {
  return { postMessage() {}, addEventListener() {}, removeEventListener() {}, start() {} };
}

describe("readParentOrigin", () => {
  it("reads the origin the frame URL names", () => {
    assert.equal(readParentOrigin(`?parentOrigin=${encodeURIComponent(PARENT_ORIGIN)}`), PARENT_ORIGIN);
    assert.equal(readParentOrigin("?parentOrigin=http%3A%2F%2Flocalhost%3A3232"), "http://localhost:3232");
  });

  it("reads none from an absent parameter, or one that is not exactly an origin", () => {
    for (const search of [
      "",
      "?channel=wendoo-lang%2Fpxt-wendoo",
      "?parentOrigin=",
      "?parentOrigin=arcade.makecode.com",
      `?parentOrigin=${encodeURIComponent(`${PARENT_ORIGIN}/`)}`,
      `?parentOrigin=${encodeURIComponent(`${PARENT_ORIGIN}/beta`)}`,
    ]) {
      assert.equal(readParentOrigin(search), undefined, search);
    }
  });
});

describe("simx editor client", () => {
  it("posts the ready event to MakeCode's origin", () => {
    const frame = new FakeTabFrame();
    const client = connectSimxEditorClient(frame, PARENT_ORIGIN);

    client.ready();

    assert.deepEqual(frame.posted, [{ message: { type: "simxeditor", event: "ready" }, targetOrigin: PARENT_ORIGIN }]);
    client.dispose();
  });

  it("delivers each port MakeCode brokers, in order", () => {
    const frame = new FakeTabFrame();
    const client = connectSimxEditorClient(frame, PARENT_ORIGIN);
    const ports: MakeCodeMessagePort[] = [];
    client.onPort((port) => ports.push(port));
    const first = fakePort();
    const second = fakePort();

    frame.receive({ type: "simxeditorport", key: "wendoo-lang/pxt-wendoo" }, [first]);
    frame.receive({ type: "simxeditorport", key: "wendoo-lang/pxt-wendoo" }, [second]);

    assert.equal(ports.length, 2);
    assert.equal(ports[0], first);
    assert.equal(ports[1], second);
    client.dispose();
  });

  it("delivers the lifecycle, simulator and action events MakeCode posts", () => {
    const frame = new FakeTabFrame();
    const client = connectSimxEditorClient(frame, PARENT_ORIGIN);
    const events: SimxEditorEvent[] = [];
    client.onEvent((event) => events.push(event));
    const posted: SimxEditorEvent[] = [
      { type: "simxeditor", event: "shown" },
      { type: "simxeditor", event: "hidden" },
      { type: "simxeditor", event: "simulator", command: "restart" },
      { type: "simxeditor", event: "simulatorstate", state: "Running" },
      { type: "simxeditor", event: "fullscreen", enabled: true },
      { type: "simxeditor", event: "action", action: "create", qName: "wendoo.CompiledBrainRegistration" },
    ];

    for (const event of posted) frame.receive(event);

    assert.deepEqual(events, posted);
    client.dispose();
  });

  it("ignores messages from another origin, port messages carrying no port, and other messages", () => {
    const frame = new FakeTabFrame();
    const client = connectSimxEditorClient(frame, PARENT_ORIGIN);
    const ports: MakeCodeMessagePort[] = [];
    const events: SimxEditorEvent[] = [];
    client.onPort((port) => ports.push(port));
    client.onEvent((event) => events.push(event));

    frame.receive({ type: "simxeditorport", key: "wendoo-lang/pxt-wendoo" }, [fakePort()], "https://elsewhere.example");
    frame.receive({ type: "simxeditor", event: "fullscreen", enabled: true }, [], "https://elsewhere.example");
    frame.receive({ type: "simxeditorport", key: "wendoo-lang/pxt-wendoo" });
    frame.receive({ type: "simxeditor", subtype: "ack", id: "1" });
    frame.receive({ type: "messagepacket", channel: "wendoo-lang/pxt-wendoo" });
    frame.receive(null);

    assert.deepEqual(ports, []);
    assert.deepEqual(events, []);
    client.dispose();
  });

  it("delivers nothing once disposed", () => {
    const frame = new FakeTabFrame();
    const client = connectSimxEditorClient(frame, PARENT_ORIGIN);
    const events: SimxEditorEvent[] = [];
    client.onEvent((event) => events.push(event));

    client.dispose();
    frame.receive({ type: "simxeditor", event: "fullscreen", enabled: true });

    assert.deepEqual(events, []);
  });
});

describe("forwardTabActions", () => {
  it("makes each create action MakeCode posts a create request for the type it names, in order", () => {
    const frame = new FakeTabFrame();
    const client = connectSimxEditorClient(frame, PARENT_ORIGIN);
    const requested: EditorRequest[] = [];
    forwardTabActions(client, { request: (request) => requested.push(request) });

    frame.receive({ type: "simxeditor", event: "action", action: "create", qName: "wendoo.CompiledBrainRegistration" });
    frame.receive({ type: "simxeditor", event: "action", action: "create", qName: "other.Type" });

    assert.deepEqual(requested, [
      { kind: "create", qName: "wendoo.CompiledBrainRegistration" },
      { kind: "create", qName: "other.Type" },
    ]);
    client.dispose();
  });

  it("makes each open action MakeCode posts an open request for the instance it names, in order with creates", () => {
    const frame = new FakeTabFrame();
    const client = connectSimxEditorClient(frame, PARENT_ORIGIN);
    const requested: EditorRequest[] = [];
    forwardTabActions(client, { request: (request) => requested.push(request) });

    frame.receive({ type: "simxeditor", event: "action", action: "open", qName: "wendooBrains.p_abcdabcdabcdabcd" });
    frame.receive({ type: "simxeditor", event: "action", action: "create", qName: "wendoo.CompiledBrainRegistration" });

    assert.deepEqual(requested, [
      { kind: "open", qName: "wendooBrains.p_abcdabcdabcdabcd" },
      { kind: "create", qName: "wendoo.CompiledBrainRegistration" },
    ]);
    client.dispose();
  });

  it("requests nothing for the lifecycle and simulator events, or for another action", () => {
    const frame = new FakeTabFrame();
    const client = connectSimxEditorClient(frame, PARENT_ORIGIN);
    const requested: EditorRequest[] = [];
    forwardTabActions(client, { request: (request) => requested.push(request) });

    frame.receive({ type: "simxeditor", event: "shown" });
    frame.receive({ type: "simxeditor", event: "hidden" });
    frame.receive({ type: "simxeditor", event: "simulator", command: "start" });
    frame.receive({ type: "simxeditor", event: "simulatorstate", state: "Running" });
    frame.receive({ type: "simxeditor", event: "fullscreen", enabled: false });
    frame.receive({ type: "simxeditor", event: "action", action: "rename", qName: "wendoo.CompiledBrainRegistration" });

    assert.deepEqual(requested, []);
    client.dispose();
  });

  it("requests nothing once unsubscribed", () => {
    const frame = new FakeTabFrame();
    const client = connectSimxEditorClient(frame, PARENT_ORIGIN);
    const requested: EditorRequest[] = [];
    const stop = forwardTabActions(client, { request: (request) => requested.push(request) });

    stop();
    frame.receive({ type: "simxeditor", event: "action", action: "create", qName: "wendoo.CompiledBrainRegistration" });

    assert.deepEqual(requested, []);
    client.dispose();
  });
});
