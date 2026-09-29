import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConnectionStatus } from "@wendoo/bridge-client";
import { BridgeSessionErrorCode, PeerSessionErrorCode } from "@wendoo/bridge-protocol";
import type { SimxBridgeErrorCode } from "./simx-bridge.js";
import { AWAY_DISPLAY_GRACE_MS, SimxStatusModel, type SimxStatusSource, type SimxStatusView } from "./status-model.js";

/** A session state the spec sets field by field, announcing each change as a bridge does. */
class FakeSource implements SimxStatusSource {
  joinCode: string | undefined;
  counterpartAway = false;
  counterpartConnected = false;
  bound = false;
  connection: ConnectionStatus = "connecting";
  errorCode: SimxBridgeErrorCode | undefined;
  /** How many times {@link startNewSession} was called. */
  newSessions = 0;
  private readonly _listeners = new Set<() => void>();

  onChange(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  startNewSession(): void {
    this.newSessions += 1;
    this.set({
      joinCode: undefined,
      counterpartAway: false,
      counterpartConnected: false,
      bound: false,
      connection: "connecting",
      errorCode: undefined,
    });
  }

  /** Applies `fields`, then announces the change. */
  set(fields: Partial<Omit<FakeSource, "set" | "onChange" | "startNewSession" | "newSessions">>): void {
    Object.assign(this, fields);
    for (const listener of this._listeners) listener();
  }

  /** The source of a simx waiting for an editor, showing `code`. */
  static vacant(code: string): FakeSource {
    const source = new FakeSource();
    source.set({ connection: "connected", joinCode: code });
    return source;
  }

  /** The source of a simx whose editor is connected. */
  static connected(): FakeSource {
    const source = new FakeSource();
    source.set({ connection: "connected", counterpartConnected: true, bound: true });
    return source;
  }
}

/** Records the state of every view `model` publishes. */
function trace(model: SimxStatusModel): SimxStatusView["state"][] {
  const states: SimxStatusView["state"][] = [];
  model.subscribe(() => states.push(model.getSnapshot().state));
  return states;
}

describe("simx status model", () => {
  it("shows connecting from boot until the bridge service answers, noting a retry once a connect attempt failed", () => {
    const source = new FakeSource();
    const model = new SimxStatusModel(source);
    assert.equal(model.getSnapshot().state, "connecting");
    assert.equal(model.getSnapshot().retrying, false);

    source.set({ connection: "reconnecting" });
    assert.equal(model.getSnapshot().state, "connecting");
    assert.equal(model.getSnapshot().retrying, true);

    source.set({ connection: "connected" });
    assert.equal(model.getSnapshot().state, "connecting");
    assert.equal(model.getSnapshot().retrying, false);

    source.set({ joinCode: "ribbon-lemur-whistle" });
    assert.deepEqual(model.getSnapshot(), {
      state: "code",
      joinCode: "ribbon-lemur-whistle",
      retrying: false,
      endFrom: undefined,
    });
  });

  it("swaps a rotated join code in place, and takes the code down at the welcome", () => {
    const source = FakeSource.vacant("ribbon-lemur-whistle");
    const model = new SimxStatusModel(source);

    source.set({ joinCode: "maple-otter-drum" });
    assert.deepEqual(model.getSnapshot(), {
      state: "code",
      joinCode: "maple-otter-drum",
      retrying: false,
      endFrom: undefined,
    });

    source.set({ joinCode: undefined, counterpartConnected: true, bound: true });
    assert.deepEqual(model.getSnapshot(), {
      state: "connected",
      joinCode: undefined,
      retrying: false,
      endFrom: undefined,
    });
  });

  it("shows away only once the counterpart has stayed away for the display grace, never its vacancy code", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const source = FakeSource.connected();
    const model = new SimxStatusModel(source);

    source.set({ counterpartConnected: false, counterpartAway: true });
    source.set({ joinCode: "maple-otter-drum" });
    t.mock.timers.tick(AWAY_DISPLAY_GRACE_MS - 1);
    assert.equal(model.getSnapshot().state, "connected");

    t.mock.timers.tick(1);
    assert.deepEqual(model.getSnapshot(), { state: "away", joinCode: undefined, retrying: false, endFrom: undefined });
  });

  it("never shows away when the counterpart returns within the grace, and starts the next absence's grace afresh", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const source = FakeSource.connected();
    const model = new SimxStatusModel(source);
    const states = trace(model);

    source.set({ counterpartConnected: false, counterpartAway: true, joinCode: "maple-otter-drum" });
    t.mock.timers.tick(AWAY_DISPLAY_GRACE_MS - 1);
    source.set({ counterpartConnected: true, counterpartAway: false, joinCode: undefined });
    t.mock.timers.tick(AWAY_DISPLAY_GRACE_MS * 3);
    assert.ok(!states.includes("away"));

    source.set({ counterpartConnected: false, counterpartAway: true, joinCode: "cedar-finch-bell" });
    t.mock.timers.tick(AWAY_DISPLAY_GRACE_MS - 1);
    assert.equal(model.getSnapshot().state, "connected");
    t.mock.timers.tick(1);
    assert.equal(model.getSnapshot().state, "away");
  });

  it("shows away, never the code, when it rejoins its binding by token while the editor is gone", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const source = new FakeSource();
    source.set({ bound: true });
    const model = new SimxStatusModel(source);
    const states = trace(model);

    source.set({ connection: "connected" });
    source.set({ joinCode: "maple-otter-drum" });
    t.mock.timers.tick(AWAY_DISPLAY_GRACE_MS);

    assert.deepEqual(model.getSnapshot(), { state: "away", joinCode: undefined, retrying: false, endFrom: undefined });
    assert.ok(!states.includes("code"));
  });

  it("shows connecting while its own connection is down, whatever the counterpart's state", () => {
    const source = FakeSource.connected();
    const model = new SimxStatusModel(source);

    source.set({ connection: "reconnecting", counterpartConnected: false });

    assert.deepEqual(model.getSnapshot(), {
      state: "connecting",
      joinCode: undefined,
      retrying: true,
      endFrom: undefined,
    });
  });

  it("shows ended when the session was ended, and for every other failure that stops the connection", () => {
    for (const code of [
      BridgeSessionErrorCode.SESSION_ENDED,
      BridgeSessionErrorCode.SESSION_REPLACED,
      BridgeSessionErrorCode.OUTBOUND_QUEUE_OVERFLOW,
      BridgeSessionErrorCode.JOIN_CODE_UNKNOWN,
    ]) {
      const source = FakeSource.connected();
      const model = new SimxStatusModel(source);
      source.set({ errorCode: code, connection: "disconnected", counterpartConnected: false });
      assert.equal(model.getSnapshot().state, "ended", code);
    }
  });

  it("shows update needed for a version rejection, from the bridge service or from the editor's hello", () => {
    const refused = new SimxStatusModel(
      (() => {
        const source = new FakeSource();
        source.set({ errorCode: BridgeSessionErrorCode.PROTOCOL_VERSION_MISMATCH, connection: "disconnected" });
        return source;
      })()
    );
    assert.equal(refused.getSnapshot().state, "update");

    const source = FakeSource.connected();
    const model = new SimxStatusModel(source);
    source.set({ errorCode: PeerSessionErrorCode.PROTOCOL_VERSION_NEWER });
    assert.equal(model.getSnapshot().state, "update");
  });

  it("asks before ending: the end request shows the confirmation, and cancelling returns to the state it came from", () => {
    const source = FakeSource.connected();
    const model = new SimxStatusModel(source);

    model.requestEnd();
    assert.deepEqual(model.getSnapshot(), {
      state: "confirm",
      joinCode: undefined,
      retrying: false,
      endFrom: "connected",
    });
    model.cancelEnd();
    assert.equal(model.getSnapshot().state, "connected");
    assert.equal(source.newSessions, 0);
  });

  it("ends and opens a new session only once confirmed, then shows the new pairing's code", () => {
    const source = FakeSource.connected();
    const model = new SimxStatusModel(source);

    model.confirmEnd();
    assert.equal(source.newSessions, 0);
    model.requestEnd();
    model.confirmEnd();

    assert.equal(source.newSessions, 1);
    assert.equal(model.getSnapshot().state, "connecting");
    source.set({ connection: "connected", joinCode: "cedar-finch-bell" });
    assert.deepEqual(model.getSnapshot(), {
      state: "code",
      joinCode: "cedar-finch-bell",
      retrying: false,
      endFrom: undefined,
    });
  });

  it("offers ending from away too, and keeps the confirmation while the counterpart comes and goes", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const source = FakeSource.connected();
    const model = new SimxStatusModel(source);
    source.set({ counterpartConnected: false, counterpartAway: true, joinCode: "maple-otter-drum" });
    t.mock.timers.tick(AWAY_DISPLAY_GRACE_MS);

    model.requestEnd();
    assert.equal(model.getSnapshot().state, "confirm");
    assert.equal(model.getSnapshot().endFrom, "away");
    source.set({ counterpartConnected: true, counterpartAway: false, joinCode: undefined });
    assert.equal(model.getSnapshot().state, "confirm");
    assert.equal(model.getSnapshot().endFrom, "connected");

    model.confirmEnd();
    assert.equal(source.newSessions, 1);
  });

  it("drops a pending confirmation when the session leaves the states it can end from", () => {
    const source = FakeSource.connected();
    const model = new SimxStatusModel(source);
    model.requestEnd();

    source.set({ errorCode: BridgeSessionErrorCode.SESSION_ENDED, connection: "disconnected", bound: false });
    assert.equal(model.getSnapshot().state, "ended");
    model.confirmEnd();
    assert.equal(source.newSessions, 0);
  });

  it("offers ending only from connected and away", () => {
    const source = FakeSource.vacant("ribbon-lemur-whistle");
    const model = new SimxStatusModel(source);

    model.requestEnd();

    assert.equal(model.getSnapshot().state, "code");
  });

  it("starts a new session from ended only", () => {
    const source = FakeSource.connected();
    const model = new SimxStatusModel(source);
    model.startNewSession();
    assert.equal(source.newSessions, 0);

    source.set({ errorCode: BridgeSessionErrorCode.SESSION_ENDED, connection: "disconnected", bound: false });
    model.startNewSession();

    assert.equal(source.newSessions, 1);
    source.set({ connection: "connected", joinCode: "cedar-finch-bell" });
    assert.equal(model.getSnapshot().joinCode, "cedar-finch-bell");
  });

  it("publishes only when the view changes, and stops following the bridge once disposed", () => {
    const source = FakeSource.vacant("ribbon-lemur-whistle");
    const model = new SimxStatusModel(source);
    const states = trace(model);

    source.set({});
    assert.deepEqual(states, []);
    model.dispose();
    source.set({ joinCode: "maple-otter-drum" });
    assert.deepEqual(states, []);
  });
});
