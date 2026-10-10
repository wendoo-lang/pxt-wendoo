import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PeerSessionErrorCode } from "@wendoo/bridge-app";
import { connectionStatus } from "./connection-status.js";
import type { EditorSessionViewState } from "./editor-session-store.js";

/** A view state with `fields` layered over connected-session defaults. */
function stateWith(fields: Partial<EditorSessionViewState>): EditorSessionViewState {
  return {
    status: "connected",
    errorCode: undefined,
    connectedSinceOpen: true,
    catalogText: undefined,
    assets: undefined,
    projectName: undefined,
    target: undefined,
    ...fields,
  };
}

describe("connectionStatus", () => {
  it("is connected while the session is connected", () => {
    assert.equal(connectionStatus(stateWith({})), "connected");
  });

  it("is connecting while the session has not connected yet", () => {
    assert.equal(connectionStatus(stateWith({ status: "disconnected", connectedSinceOpen: false })), "connecting");
  });

  it("is reconnecting at once when a session that has connected is disconnected", () => {
    assert.equal(connectionStatus(stateWith({ status: "disconnected" })), "reconnecting");
  });

  it("needs an update at once for a version rejection, connected before or not", () => {
    const errorCode = PeerSessionErrorCode.PROTOCOL_VERSION_NEWER;
    assert.equal(connectionStatus(stateWith({ status: "disconnected", errorCode })), "update");
    assert.equal(
      connectionStatus(stateWith({ status: "disconnected", errorCode, connectedSinceOpen: false })),
      "update"
    );
  });
});
