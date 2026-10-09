import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PeerSessionErrorCode } from "@wendoo/bridge-app";
import { DocsSidebarProvider } from "@wendoo/docs";
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
 * Renders the header under providers whose session store reports `state`,
 * whose brains store reports `brains` over an empty store's view, and whose
 * docs sidebar is closed.
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
      createElement(
        BrainsProvider,
        { value: brainsStore },
        createElement(DocsSidebarProvider, null, createElement(AppHeader))
      )
    )
  );
}

describe("AppHeader", () => {
  it("shows no target segment, whatever target the session declares", () => {
    for (const target of ["arcade", "microbit", "gameboy", undefined]) {
      const markup = render(stateWith({ target }));

      assert.match(markup, /data-testid="app-header"/);
      assert.doesNotMatch(markup, /data-testid="target-name"/);
    }
  });

  it("shows the project name as the path element after the logotype", () => {
    const markup = render(stateWith({ target: "arcade", projectName: "My Platformer" }));

    assert.match(
      markup,
      /<\/a><span aria-hidden="true"[^>]*>[^<]*<\/span><span data-testid="project-name"[^>]*>My Platformer</
    );
  });

  it("cuts a long project name short with an ellipsis, carrying the whole name on hover", () => {
    const markup = render(stateWith({ projectName: "My Platformer" }));
    const tag = /<span [^>]*data-testid="project-name"[^>]*>/.exec(markup)?.[0];

    assert.ok(tag, "expected the project name");
    assert.match(tag, /\bclass="[^"]*\btruncate\b/);
    assert.match(tag, /\bclass="[^"]*\bmax-w-/);
    assert.match(tag, /\btitle="[^"]+"/);
  });

  it("shows the header it shows without a project name while none is known", () => {
    for (const projectName of [undefined, "", 42 as unknown as string]) {
      const named = render(stateWith({ projectName }));

      assert.doesNotMatch(named, /data-testid="project-name"/);
      assert.equal(named, render(stateWith({})));
    }
  });

  it("shows the session's connection status as the status dot alone", () => {
    const cases: [Partial<EditorSessionViewState>, string][] = [
      [{}, "connected"],
      [{ status: "disconnected" }, "connected"],
      [{ status: "disconnected", connectedSinceOpen: false }, "connecting"],
      [{ status: "disconnected", disconnectedBeyondGrace: true }, "reconnecting"],
      [{ status: "disconnected", errorCode: PeerSessionErrorCode.PROTOCOL_VERSION_NEWER }, "update"],
    ];
    for (const [fields, status] of cases) {
      const markup = render(stateWith(fields));

      assert.match(markup, new RegExp(`data-testid="status-dot" data-status="${status}"`));
      assert.doesNotMatch(markup, /data-testid="connection-status"/);
    }
  });

  it("offers no End session in any status", () => {
    for (const fields of [
      {},
      { status: "disconnected" as const },
      { status: "disconnected" as const, disconnectedBeyondGrace: true },
      { status: "disconnected" as const, connectedSinceOpen: false },
    ]) {
      assert.doesNotMatch(render(stateWith(fields)), /data-testid="end-session-button"/);
    }
  });

  it("shows the brains store's save status before the status dot, in every status", () => {
    const unsaved = render(stateWith({ status: "disconnected", disconnectedBeyondGrace: true }), {
      pending: new Set(["a"]),
      reconciled: false,
    });
    assert.match(unsaved, /data-testid="save-status" data-save-state="unsaved" data-pending="1"/);
    assert.ok(unsaved.indexOf('data-testid="save-status"') < unsaved.indexOf('data-testid="status-dot"'));

    const saving = render(stateWith({}), { pending: new Set(["a"]), pushesInFlight: 1, reconciled: true });
    assert.match(saving, /data-testid="save-status" data-save-state="saving"/);

    assert.match(render(stateWith({})), /data-testid="save-status" data-save-state="saved"/);
  });

  it("offers the Docs toggle first in the controls, before the save status, collapsed while the sidebar is closed", () => {
    const markup = render(stateWith({ projectName: "My Platformer" }));
    const tag = /<button [^>]*data-testid="docs-button"[^>]*>/.exec(markup)?.[0];

    assert.ok(tag, "expected the docs button");
    assert.match(tag, /aria-controls="docs-sidebar"/);
    assert.match(tag, /aria-expanded="false"/);
    assert.ok(markup.indexOf("</h1>") < markup.indexOf('data-testid="docs-button"'));
    assert.ok(markup.indexOf('data-testid="docs-button"') < markup.indexOf('data-testid="save-status"'));
  });

  it("links the logotype to the Wendoo homepage in a new tab", () => {
    const markup = render(stateWith({}));
    const link = /<a [^>]*href="https:\/\/wendoo.com"[^>]*>/.exec(markup)?.[0];

    assert.ok(link, "expected a homepage link");
    assert.match(link, /target="_blank"/);
    assert.match(link, /rel="noopener noreferrer"/);
    assert.match(link, /aria-label="[^"]+"/);
    assert.match(markup, /href="https:\/\/wendoo.com"[^>]*><svg [^>]*aria-hidden="true"/);
  });
});
