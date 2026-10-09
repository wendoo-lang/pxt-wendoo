import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BridgeSessionErrorCode } from "@wendoo/bridge-app";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorSessionProvider } from "../contexts/editor-session.js";
import { RecentBindingsProvider } from "../contexts/recent-bindings.js";
import type { RecentBinding } from "../services/binding-entries.js";
import type { EditorSessionStore, EditorSessionViewState } from "../services/editor-session-store.js";
import type { RecentBindings } from "../services/recent-bindings.js";
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
    assets: undefined,
    projectName: undefined,
    target: undefined,
    ...fields,
  };
}

/** Renders `ui` under providers whose store reports `state` and whose recent projects are `recent`. */
function renderWith(state: EditorSessionViewState, ui: ReactElement, recent: readonly RecentBinding[] = []): string {
  const store = {
    subscribe: () => () => {},
    getSnapshot: () => state,
  } as unknown as EditorSessionStore;
  const bindings = {
    subscribe: () => () => {},
    getSnapshot: () => recent,
  } as unknown as RecentBindings;
  return renderToStaticMarkup(
    createElement(
      EditorSessionProvider,
      { value: store },
      createElement(RecentBindingsProvider, { value: bindings }, ui)
    )
  );
}

/** A recent project with id `id`, carrying `fields`. */
function recentBinding(id: string, fields: Partial<RecentBinding> = {}): RecentBinding {
  return { id, projectName: undefined, target: undefined, lastSeen: 0, ...fields };
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
    assert.doesNotMatch(markup, /data-testid="recent-projects"/);
  });

  it("lists the recent projects below the entry, one row each carrying its entry id and target, with open and remove", () => {
    const markup = renderWith(stateWith({}), createElement(ConnectPage), [
      recentBinding("00000000000000aa", { projectName: "Space Chase", target: "arcade" }),
      recentBinding("00000000000000bb"),
    ]);

    assert.match(markup, /data-testid="recent-projects"/);
    assert.ok(markup.indexOf('data-testid="join-code-input"') < markup.indexOf('data-testid="recent-projects"'));
    const rows = [...markup.matchAll(/data-testid="recent-project" data-binding-id="([0-9a-f]+)"/g)].map((m) => m[1]);
    assert.deepEqual(rows, ["00000000000000aa", "00000000000000bb"]);
    assert.match(markup, /data-binding-id="00000000000000aa" data-target="arcade"/);
    assert.equal(markup.match(/data-testid="recent-project-open"/g)?.length, 2);
    assert.equal(markup.match(/data-testid="recent-project-remove"/g)?.length, 2);
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

  it("offers no End session, whether idle, with a code pending, or after an end", () => {
    for (const fields of [{}, { entry: "submitted" as const }, { errorCode: BridgeSessionErrorCode.SESSION_ENDED }]) {
      assert.doesNotMatch(
        renderWith(stateWith(fields), createElement(ConnectPage)),
        /data-testid="end-session-button"/
      );
    }
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
