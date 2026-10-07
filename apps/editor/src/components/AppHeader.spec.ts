import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BridgeSessionErrorCode } from "@wendoo/bridge-app";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrainsProvider } from "../contexts/brains.js";
import { EditorSessionProvider } from "../contexts/editor-session.js";
import type { BrainsSessionState, BrainsViewState } from "../services/brains-store.js";
import { BrainsStore } from "../services/brains-store.js";
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
    assets: undefined,
    projectName: undefined,
    target: undefined,
    ...fields,
  };
}

/**
 * Renders the header under providers whose session store reports `state` and
 * whose brains store reports `brains` over an empty store's view.
 */
function render(state: EditorSessionViewState, brains: Partial<BrainsViewState> = {}): string {
  const store = {
    subscribe: () => () => {},
    getSnapshot: () => state,
  } as unknown as EditorSessionStore;
  const held = new BrainsStore({
    subscribe: () => () => {},
    getSnapshot: (): BrainsSessionState => ({ status: state.status, catalogText: undefined, assets: undefined }),
  });
  const brainsView = { ...held.getSnapshot(), ...brains };
  const brainsStore = { subscribe: held.subscribe, getSnapshot: () => brainsView } as unknown as BrainsStore;
  return renderToStaticMarkup(
    createElement(
      EditorSessionProvider,
      { value: store },
      createElement(BrainsProvider, { value: brainsStore }, createElement(AppHeader))
    )
  );
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

  it("shows the project name as the path element after the target's", () => {
    const markup = render(stateWith({ target: "arcade", projectName: "My Platformer" }));

    assert.match(markup, /data-testid="project-name">My Platformer</);
    assert.ok(markup.indexOf('data-testid="target-name"') < markup.indexOf('data-testid="project-name"'));
    const between = markup.slice(
      markup.indexOf('data-testid="target-name"'),
      markup.indexOf('data-testid="project-name"')
    );
    assert.match(between, /<span aria-hidden="true"/);
  });

  it("shows the project name as the path element after the logotype while no target is declared", () => {
    const markup = render(stateWith({ target: undefined, projectName: "My Platformer" }));

    assert.doesNotMatch(markup, /data-testid="target-name"/);
    assert.match(markup, /<span aria-hidden="true"[^>]*>[^<]*<\/span><span data-testid="project-name">My Platformer</);
  });

  it("shows the header it shows without a project name while none is known", () => {
    for (const projectName of [undefined, "", 42 as unknown as string]) {
      const named = render(stateWith({ target: "arcade", projectName }));

      assert.doesNotMatch(named, /data-testid="project-name"/);
      assert.equal(named, render(stateWith({ target: "arcade" })));
    }
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

  it("offers End session beside the status while a session is connected or reconnecting", () => {
    const connected = render(stateWith({}));
    assert.match(connected, /data-testid="end-session-button"/);
    assert.ok(
      connected.indexOf('data-testid="connection-status"') < connected.indexOf('data-testid="end-session-button"')
    );

    const withinGrace = render(stateWith({ status: "disconnected" }));
    assert.match(withinGrace, /data-testid="connection-status" data-status="connected"/);
    assert.match(withinGrace, /data-testid="end-session-button"/);

    const reconnecting = render(stateWith({ status: "disconnected", disconnectedBeyondGrace: true }));
    assert.match(reconnecting, /data-testid="connection-status" data-status="reconnecting"/);
    assert.match(reconnecting, /data-testid="end-session-button"/);
  });

  it("offers no End session while connecting, taken over, or needing an update", () => {
    const connecting = render(stateWith({ status: "disconnected", connectedSinceOpen: false }));
    assert.match(connecting, /data-testid="connection-status" data-status="connecting"/);
    assert.doesNotMatch(connecting, /data-testid="end-session-button"/);

    const replaced = render(
      stateWith({
        status: "disconnected",
        errorCode: BridgeSessionErrorCode.SESSION_REPLACED,
        disconnectedBeyondGrace: true,
      })
    );
    assert.match(replaced, /data-testid="connection-status" data-status="replaced"/);
    assert.doesNotMatch(replaced, /data-testid="end-session-button"/);

    const update = render(
      stateWith({
        status: "disconnected",
        errorCode: BridgeSessionErrorCode.PROTOCOL_VERSION_MISMATCH,
        disconnectedBeyondGrace: true,
      })
    );
    assert.match(update, /data-testid="connection-status" data-status="update"/);
    assert.doesNotMatch(update, /data-testid="end-session-button"/);
  });

  it("shows the brains store's save status beside the connection status, in every status", () => {
    const unsaved = render(stateWith({ status: "disconnected", disconnectedBeyondGrace: true }), {
      pending: new Set(["a"]),
      reconciled: false,
    });
    assert.match(unsaved, /data-testid="save-status" data-save-state="unsaved" data-pending="1"/);
    assert.ok(unsaved.indexOf('data-testid="save-status"') < unsaved.indexOf('data-testid="connection-status"'));

    const saving = render(stateWith({}), { pending: new Set(["a"]), pushesInFlight: 1, reconciled: true });
    assert.match(saving, /data-testid="save-status" data-save-state="saving"/);

    assert.match(render(stateWith({})), /data-testid="save-status" data-save-state="saved"/);
  });

  it("links the logotype to the Wendoo homepage in a new tab", () => {
    const markup = render(stateWith({ target: "arcade" }));
    const link = /<a [^>]*href="https:\/\/wendoo.com"[^>]*>/.exec(markup)?.[0];

    assert.ok(link, "expected a homepage link");
    assert.match(link, /target="_blank"/);
    assert.match(link, /rel="noopener noreferrer"/);
    assert.match(link, /aria-label="[^"]+"/);
    assert.match(markup, /href="https:\/\/wendoo.com"[^>]*><svg [^>]*aria-hidden="true"/);
    assert.match(markup, /data-testid="target-name" data-target="arcade"/);
  });
});
