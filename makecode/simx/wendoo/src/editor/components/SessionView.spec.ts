import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BridgeSessionErrorCode, PeerSessionErrorCode } from "@wendoo/bridge-app";
import { DocsSidebarProvider } from "@wendoo/docs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrainsProvider } from "../contexts/brains.js";
import { EditorSessionProvider } from "../contexts/editor-session.js";
import { CATALOG_PACK_UNBOUND } from "../services/authoring-environment.js";
import { BrainsStore } from "../services/brains-store.js";
import { CATALOG_UNREADABLE } from "../services/catalog.js";
import type { EditorSessionStore, EditorSessionViewState } from "../services/editor-session-store.js";
import { SessionView } from "./SessionView.js";

const CATALOG_TEXT = '{"packs":[{"name":"motion","tiles":[{"name":"move","kind":"actuator"}]}]}';

/** A view state with `fields` layered over connected-session defaults. */
function stateWith(fields: Partial<EditorSessionViewState>): EditorSessionViewState {
  return {
    view: "session",
    status: "connected",
    entry: undefined,
    joinCode: "apple-bird-cloud",
    errorCode: undefined,
    disconnectedBeyondGrace: false,
    connectedSinceOpen: true,
    catalogText: CATALOG_TEXT,
    assets: undefined,
    projectName: undefined,
    target: undefined,
    ...fields,
  };
}

/**
 * Renders the session view under providers whose session store reports
 * `state`, whose brains store follows it and holds a brain named each of
 * `brainNames`, and whose docs sidebar is closed.
 */
function render(state: EditorSessionViewState, brainNames: readonly string[] = []): string {
  const store = {
    subscribe: () => () => {},
    getSnapshot: () => state,
  } as unknown as EditorSessionStore;
  const brains = new BrainsStore(store);
  for (const name of brainNames) brains.addBrain(name);
  return renderToStaticMarkup(
    createElement(
      EditorSessionProvider,
      { value: store },
      createElement(
        BrainsProvider,
        { value: brains },
        createElement(DocsSidebarProvider, null, createElement(SessionView))
      )
    )
  );
}

describe("SessionView", () => {
  it("shows no join code while connected, even one the store holds, no notices, and no catalog panel", () => {
    const markup = render(stateWith({}));

    assert.doesNotMatch(markup, /data-testid="join-code"/);
    assert.doesNotMatch(markup, /apple-bird-cloud/);
    assert.doesNotMatch(markup, /data-testid="copy-join-code"/);
    assert.doesNotMatch(markup, /data-testid="catalog-panel"/);
    assert.doesNotMatch(markup, /data-testid="catalog-tile"/);
    assert.doesNotMatch(markup, /data-testid="replaced-notice"/);
    assert.doesNotMatch(markup, /data-testid="version-notice"/);
    assert.doesNotMatch(markup, /data-testid="code-unknown-notice"/);
  });

  it("renders the app header, naming the declared target and showing the connection status", () => {
    const markup = render(stateWith({ target: "arcade" }));

    assert.match(markup, /data-testid="app-header"/);
    assert.match(markup, /data-testid="target-name" data-target="arcade"/);
    assert.match(markup, /data-testid="connection-status" data-status="connected"/);
  });

  it("stays quiet about a disconnection within the grace, keeping the session view rendered", () => {
    const markup = render(stateWith({ status: "disconnected" }), ["Chaser"]);

    assert.match(markup, /data-testid="connection-status" data-status="connected"/);
    assert.match(markup, /data-testid="brain-list"/);
  });

  it("states a disconnection past the grace in the header alone, offering End session there and no away card", () => {
    const markup = render(stateWith({ status: "disconnected", disconnectedBeyondGrace: true }), ["Chaser"]);

    assert.match(markup, /data-testid="connection-status" data-status="reconnecting"/);
    assert.match(markup, /data-testid="end-session-button"/);
    assert.doesNotMatch(markup, /data-testid="disconnected-indicator"/);
    assert.doesNotMatch(markup, /data-testid="forget-button"/);
    assert.match(markup, /data-testid="brain-list"/);
  });

  it("shows the replacement hold at once, with reconnect and start-over actions", () => {
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
  });

  it("shows the version notice with its reload remedy at once", () => {
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
  });

  it("shows the not-recognized notice, carrying the stable code, while it falls back to the held session", () => {
    const markup = render(
      stateWith({
        status: "disconnected",
        errorCode: BridgeSessionErrorCode.JOIN_CODE_UNKNOWN,
        connectedSinceOpen: false,
      })
    );

    assert.match(markup, /data-testid="code-unknown-notice"/);
    assert.ok(markup.includes(`data-code="${BridgeSessionErrorCode.JOIN_CODE_UNKNOWN}"`));
    assert.match(markup, /data-testid="connection-status" data-status="connecting"/);
    assert.doesNotMatch(markup, /data-testid="replaced-notice"/);
  });

  it("shows the brain list, listing the store's brains", () => {
    const markup = render(stateWith({}), ["Chaser"]);

    assert.match(markup, /data-testid="brain-list"/);
    assert.match(markup, /data-testid="brain-item"[^>]*data-brain-name="Chaser"/);
  });

  it("shows no catalog diagnostics for a catalog the environment reads without problems", () => {
    const markup = render(stateWith({ catalogText: undefined }));

    assert.doesNotMatch(markup, /data-testid="catalog-diagnostics"/);
  });

  it("shows the catalog's diagnostics by stable code", () => {
    const markup = render(stateWith({}));

    assert.match(
      markup,
      new RegExp(`data-testid="catalog-diagnostic" data-code="${CATALOG_PACK_UNBOUND}" data-pack="motion"`)
    );
  });

  it("shows an unreadable catalog's diagnostic by its stable code", () => {
    const markup = render(stateWith({ catalogText: "not a catalog" }));

    assert.match(markup, new RegExp(`data-testid="catalog-diagnostic" data-code="${CATALOG_UNREADABLE}"`));
  });
});
