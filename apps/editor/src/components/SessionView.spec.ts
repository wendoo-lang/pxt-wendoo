import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BridgeSessionErrorCode, PeerSessionErrorCode } from "@wendoo/bridge-app";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorSessionProvider } from "../contexts/editor-session.js";
import type { EditorSessionStore, EditorSessionViewState } from "../services/editor-session-store.js";
import { SessionView } from "./SessionView.js";

const CATALOG_TEXT = '{"packs":[{"name":"motion","tiles":[{"name":"move","kind":"actuator"}]}]}';

/** A view state with `fields` layered over connected-session defaults. */
function stateWith(fields: Partial<EditorSessionViewState>): EditorSessionViewState {
  return {
    view: "session",
    status: "connected",
    joinCode: "apple-bird-cloud",
    errorCode: undefined,
    disconnectedBeyondGrace: false,
    catalogText: CATALOG_TEXT,
    ...fields,
  };
}

/** Renders the session view under a provider whose store reports `state`. */
function render(state: EditorSessionViewState): string {
  const store = {
    subscribe: () => () => {},
    getSnapshot: () => state,
  } as unknown as EditorSessionStore;
  return renderToStaticMarkup(createElement(EditorSessionProvider, { value: store }, createElement(SessionView)));
}

describe("SessionView", () => {
  it("shows the join code with a copy affordance and the catalog while connected, with no notices", () => {
    const markup = render(stateWith({}));

    assert.match(markup, /data-testid="join-code"[^>]*>apple-bird-cloud</);
    assert.match(markup, /data-testid="copy-join-code"/);
    assert.match(markup, /data-testid="catalog-tile" data-name="move"/);
    assert.doesNotMatch(markup, /data-testid="disconnected-indicator"/);
    assert.doesNotMatch(markup, /data-testid="replaced-notice"/);
    assert.doesNotMatch(markup, /data-testid="version-notice"/);
  });

  it("stays quiet about a disconnection within the grace, keeping the catalog rendered", () => {
    const markup = render(stateWith({ status: "disconnected" }));

    assert.doesNotMatch(markup, /data-testid="disconnected-indicator"/);
    assert.match(markup, /data-testid="catalog-tile" data-name="move"/);
  });

  it("shows the disconnected indicator with a forget affordance once the grace has passed", () => {
    const markup = render(stateWith({ status: "disconnected", disconnectedBeyondGrace: true }));

    assert.match(markup, /data-testid="disconnected-indicator"/);
    assert.match(markup, /data-testid="forget-button"/);
    assert.match(markup, /data-testid="catalog-tile" data-name="move"/);
  });

  it("shows the replacement hold at once, with reconnect and start-over actions and no indicator", () => {
    const markup = render(
      stateWith({
        status: "disconnected",
        errorCode: BridgeSessionErrorCode.SESSION_REPLACED,
        disconnectedBeyondGrace: true,
      })
    );

    assert.match(markup, /data-testid="replaced-notice"/);
    assert.ok(markup.includes(`data-code="${BridgeSessionErrorCode.SESSION_REPLACED}"`));
    assert.match(markup, /data-testid="reconnect-button"/);
    assert.match(markup, /data-testid="start-over-button"/);
    assert.doesNotMatch(markup, /data-testid="disconnected-indicator"/);
  });

  it("shows the version notice with its reload remedy at once, and no indicator", () => {
    const markup = render(
      stateWith({
        status: "disconnected",
        errorCode: PeerSessionErrorCode.PROTOCOL_VERSION_NEWER,
        disconnectedBeyondGrace: true,
      })
    );

    assert.match(markup, /data-testid="version-notice"/);
    assert.ok(markup.includes(`data-code="${PeerSessionErrorCode.PROTOCOL_VERSION_NEWER}"`));
    assert.match(markup, /data-testid="reload-button"/);
    assert.doesNotMatch(markup, /data-testid="disconnected-indicator"/);
  });
});
