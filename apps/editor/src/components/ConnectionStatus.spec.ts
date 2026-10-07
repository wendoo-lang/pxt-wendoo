import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BridgeSessionErrorCode, PeerSessionErrorCode } from "@wendoo/bridge-app";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EditorSessionViewState } from "../services/editor-session-store.js";
import { ConnectionStatus, connectionStatus, type EditorConnectionStatus, StatusDot } from "./ConnectionStatus.js";

/** A view state with `fields` layered over connected-session defaults. */
function stateWith(fields: Partial<EditorSessionViewState>): EditorSessionViewState {
  return {
    view: "session",
    status: "connected",
    entry: undefined,
    joinCode: undefined,
    errorCode: undefined,
    disconnectedBeyondGrace: false,
    connectedSinceOpen: true,
    catalogText: undefined,
    assets: undefined,
    projectName: undefined,
    target: undefined,
    ...fields,
  };
}

describe("connectionStatus", () => {
  it("is connected in the session view while connected", () => {
    assert.equal(connectionStatus(stateWith({})), "connected");
  });

  it("stays connected through a disconnection within the grace, and turns reconnecting once it has passed", () => {
    assert.equal(connectionStatus(stateWith({ status: "disconnected" })), "connected");
    assert.equal(
      connectionStatus(stateWith({ status: "disconnected", disconnectedBeyondGrace: true })),
      "reconnecting"
    );
  });

  it("is connecting while a resumed session has not connected yet, and reconnecting once the grace has passed", () => {
    const resuming = { status: "disconnected", connectedSinceOpen: false } as const;
    assert.equal(connectionStatus(stateWith(resuming)), "connecting");
    assert.equal(connectionStatus(stateWith({ ...resuming, disconnectedBeyondGrace: true })), "reconnecting");
  });

  it("is reconnecting for an overflow, which recovers by itself, once the grace has passed", () => {
    const overflow = { status: "disconnected", errorCode: BridgeSessionErrorCode.OUTBOUND_QUEUE_OVERFLOW } as const;
    assert.equal(connectionStatus(stateWith(overflow)), "connected");
    assert.equal(connectionStatus(stateWith({ ...overflow, disconnectedBeyondGrace: true })), "reconnecting");
  });

  it("is replaced at once for a replacement hold, before and after the grace", () => {
    const replaced = { status: "disconnected", errorCode: BridgeSessionErrorCode.SESSION_REPLACED } as const;
    assert.equal(connectionStatus(stateWith(replaced)), "replaced");
    assert.equal(connectionStatus(stateWith({ ...replaced, disconnectedBeyondGrace: true })), "replaced");
  });

  it("needs an update at once for either version rejection", () => {
    for (const errorCode of [
      BridgeSessionErrorCode.PROTOCOL_VERSION_MISMATCH,
      PeerSessionErrorCode.PROTOCOL_VERSION_NEWER,
    ]) {
      assert.equal(connectionStatus(stateWith({ status: "disconnected", errorCode })), "update");
      assert.equal(
        connectionStatus(stateWith({ status: "disconnected", errorCode, disconnectedBeyondGrace: true })),
        "update"
      );
    }
  });

  it("is ended for an ended session", () => {
    assert.equal(
      connectionStatus(stateWith({ status: "disconnected", errorCode: BridgeSessionErrorCode.SESSION_ENDED })),
      "ended"
    );
  });

  it("on the connect page, follows the entered code: connecting while submitted, waiting once accepted", () => {
    const connect = { view: "connect", status: "none" } as const;
    assert.equal(connectionStatus(stateWith({ ...connect, entry: "submitted" })), "connecting");
    assert.equal(connectionStatus(stateWith({ ...connect, entry: "accepted" })), "waiting");
  });

  it("on the connect page, is absent while no entered code is pending", () => {
    assert.equal(connectionStatus(stateWith({ view: "connect", status: "none" })), undefined);
    assert.equal(
      connectionStatus(
        stateWith({ view: "connect", status: "none", errorCode: BridgeSessionErrorCode.JOIN_CODE_UNKNOWN })
      ),
      undefined
    );
  });
});

describe("StatusDot", () => {
  it("paints each status from its themeable token", () => {
    const expected: Record<EditorConnectionStatus, string> = {
      connecting: "bg-muted-foreground",
      waiting: "bg-primary",
      connected: "bg-success",
      reconnecting: "bg-warning",
      replaced: "bg-muted-foreground",
      ended: "bg-muted-foreground",
      update: "bg-destructive",
    };
    for (const [status, token] of Object.entries(expected)) {
      const markup = renderToStaticMarkup(createElement(StatusDot, { status: status as EditorConnectionStatus }));
      assert.ok(markup.includes(`data-status="${status}"`), status);
      assert.match(markup, new RegExp(`class="[^"]*\\b${token}\\b`), status);
    }
  });
});

describe("ConnectionStatus", () => {
  it("carries its status as data-status, with the dot for the same status", () => {
    const markup = renderToStaticMarkup(createElement(ConnectionStatus, { status: "reconnecting" }));

    assert.match(markup, /data-testid="connection-status" data-status="reconnecting"/);
    assert.match(markup, /data-testid="status-dot" data-status="reconnecting"/);
  });
});
