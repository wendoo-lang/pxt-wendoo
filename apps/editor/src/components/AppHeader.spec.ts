import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BridgeSessionErrorCode } from "@wendoo/bridge-app";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorSessionProvider } from "../contexts/editor-session.js";
import type { EditorSessionStore, EditorSessionViewState } from "../services/editor-session-store.js";
import { AppHeader } from "./AppHeader.js";

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
    target: undefined,
    ...fields,
  };
}

/** Renders the header under a provider whose store reports `state`. */
function render(state: EditorSessionViewState): string {
  const store = {
    subscribe: () => () => {},
    getSnapshot: () => state,
  } as unknown as EditorSessionStore;
  return renderToStaticMarkup(createElement(EditorSessionProvider, { value: store }, createElement(AppHeader)));
}

describe("AppHeader", () => {
  it("names a declared, recognized target by its display name, carrying the id", () => {
    const markup = render(stateWith({ target: "microbit" }));

    assert.match(markup, /data-testid="app-header"/);
    assert.match(markup, /data-testid="target-name" data-target="microbit">micro:bit</);
  });

  it("shows the logotype alone, with no target segment, while no target is declared", () => {
    const markup = render(stateWith({ target: undefined }));

    assert.match(markup, /data-testid="app-header"/);
    assert.doesNotMatch(markup, /data-testid="target-name"/);
  });

  it("shows an unrecognized target's raw id", () => {
    const markup = render(stateWith({ target: "gameboy" }));

    assert.match(markup, /data-testid="target-name" data-target="gameboy">gameboy</);
  });

  it("treats a non-string declaration as undeclared", () => {
    const markup = render(stateWith({ target: 42 as unknown as string }));

    assert.doesNotMatch(markup, /data-testid="target-name"/);
  });

  it("shows the session's connection status", () => {
    assert.match(render(stateWith({})), /data-testid="connection-status" data-status="connected"/);
    assert.match(
      render(stateWith({ status: "disconnected", disconnectedBeyondGrace: true })),
      /data-testid="connection-status" data-status="reconnecting"/
    );
    assert.match(
      render(stateWith({ status: "disconnected", errorCode: BridgeSessionErrorCode.SESSION_REPLACED })),
      /data-testid="connection-status" data-status="replaced"/
    );
  });
});
