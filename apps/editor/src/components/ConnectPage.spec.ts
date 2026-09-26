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
    joinCode: undefined,
    errorCode: undefined,
    disconnectedBeyondGrace: false,
    catalogText: undefined,
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
