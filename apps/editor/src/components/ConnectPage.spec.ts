import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BridgeSessionErrorCode } from "@wendoo/bridge-app";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorSessionProvider } from "../contexts/editor-session.js";
import type { EditorSessionStore, EditorSessionViewState } from "../services/editor-session-store.js";
import { ConnectPage } from "./ConnectPage.js";

/** A view state with `fields` layered over connect-page defaults. */
function stateWith(fields: Partial<EditorSessionViewState>): EditorSessionViewState {
  return {
    view: "connect",
    status: "none",
    entry: undefined,
    joinCode: undefined,
    errorCode: undefined,
    disconnectedBeyondGrace: false,
    connectedSinceOpen: false,
    catalogText: undefined,
    target: undefined,
    ...fields,
  };
}

/** Renders `ui` under a provider whose store reports `state`. */
function renderWith(state: EditorSessionViewState, ui: ReactElement): string {
  const store = {
    subscribe: () => () => {},
    getSnapshot: () => state,
  } as unknown as EditorSessionStore;
  return renderToStaticMarkup(createElement(EditorSessionProvider, { value: store }, ui));
}

describe("ConnectPage", () => {
  it("renders the join-code entry with the connect action disabled until a code is typed", () => {
    const markup = renderWith(stateWith({}), createElement(ConnectPage));

    assert.match(markup, /data-testid="join-code-input"/);
    assert.match(markup, /data-testid="connect-button"[^>]*\bdisabled\b/);
    assert.doesNotMatch(markup, /data-testid="version-notice"/);
    assert.doesNotMatch(markup, /data-testid="connect-status"/);
    assert.doesNotMatch(markup, /data-testid="code-unknown-notice"/);
    assert.doesNotMatch(markup, /data-testid="ended-notice"/);
  });

  it("shows an entered code's progress: submitted and connecting, then accepted and waiting for the project", () => {
    const submitted = renderWith(stateWith({ entry: "submitted" }), createElement(ConnectPage));
    assert.match(submitted, /data-testid="connect-status" data-state="submitted" data-status="connecting"/);
    assert.match(submitted, /data-testid="status-dot" data-status="connecting"/);

    const accepted = renderWith(stateWith({ entry: "accepted" }), createElement(ConnectPage));
    assert.match(accepted, /data-testid="connect-status" data-state="accepted" data-status="waiting"/);
    assert.match(accepted, /data-testid="status-dot" data-status="waiting"/);
  });

  it("keeps its centered layout, with no app header", () => {
    assert.doesNotMatch(renderWith(stateWith({}), createElement(ConnectPage)), /data-testid="app-header"/);
  });

  it("shows the not-recognized notice, carrying the stable code, with the entry ready for another code", () => {
    const markup = renderWith(
      stateWith({ errorCode: BridgeSessionErrorCode.JOIN_CODE_UNKNOWN }),
      createElement(ConnectPage)
    );

    assert.ok(
      markup.includes(`data-testid="code-unknown-notice" data-code="${BridgeSessionErrorCode.JOIN_CODE_UNKNOWN}"`)
    );
    assert.match(markup, /data-testid="join-code-input"[^>]*value=""/);
    assert.doesNotMatch(markup, /data-testid="join-code-input"[^>]*\bdisabled\b/);
    assert.doesNotMatch(markup, /data-testid="ended-notice"/);
  });

  it("shows the ended notice, carrying the stable code, above the entry that connects afresh", () => {
    const markup = renderWith(
      stateWith({ errorCode: BridgeSessionErrorCode.SESSION_ENDED }),
      createElement(ConnectPage)
    );

    assert.ok(markup.includes(`data-testid="ended-notice" data-code="${BridgeSessionErrorCode.SESSION_ENDED}"`));
    assert.match(markup, /data-testid="join-code-input"/);
    assert.doesNotMatch(markup, /data-testid="code-unknown-notice"/);
  });

  it("shows the version notice, carrying the stable code, when a connect attempt was version-rejected", () => {
    const markup = renderWith(
      stateWith({ errorCode: BridgeSessionErrorCode.PROTOCOL_VERSION_MISMATCH }),
      createElement(ConnectPage)
    );

    assert.match(markup, /data-testid="version-notice"/);
    assert.ok(markup.includes(`data-code="${BridgeSessionErrorCode.PROTOCOL_VERSION_MISMATCH}"`));
    assert.match(markup, /data-testid="reload-button"/);
  });
});
