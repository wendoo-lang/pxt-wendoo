import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BridgeSessionErrorCode, PeerSessionErrorCode } from "@wendoo/bridge-app";
import { DocsSidebarProvider } from "@wendoo/docs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrainsProvider } from "../contexts/brains.js";
import { EditorSessionProvider } from "../contexts/editor-session.js";
import { CATALOG_PACK_UNBOUND } from "../services/authoring-environment.js";
import type { BrainsViewState } from "../services/brains-store.js";
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

/** The opening tag of the session view's root element in `markup`. */
function rootTag(markup: string): string {
  const tag = /^<div [^>]*data-testid="session-view"[^>]*>/.exec(markup)?.[0];
  assert.ok(tag, "expected the session view's root element");
  return tag;
}

/**
 * Renders the session view under providers whose session store reports
 * `state`, whose brains store follows it and holds a brain named each of
 * `brainNames`, its view reporting `brainsFields` over its own, and whose
 * docs sidebar is closed.
 */
function render(
  state: EditorSessionViewState,
  brainNames: readonly string[] = [],
  brainsFields: Partial<BrainsViewState> = {}
): string {
  const store = {
    subscribe: () => () => {},
    getSnapshot: () => state,
  } as unknown as EditorSessionStore;
  const held = new BrainsStore(store);
  for (const name of brainNames) held.addBrain(name);
  const brainsView = { ...held.getSnapshot(), ...brainsFields };
  const brains = { subscribe: held.subscribe, getSnapshot: () => brainsView } as unknown as BrainsStore;
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

  it("renders no header, no connection status and no save status, whatever the session and brains report", () => {
    for (const [fields, brainsFields] of [
      [{ target: "arcade", projectName: "My Platformer" }, {}],
      [
        { status: "disconnected", disconnectedBeyondGrace: true },
        { pending: new Set(["a"]), reconciled: false },
      ],
      [{ status: "disconnected", errorCode: PeerSessionErrorCode.PROTOCOL_VERSION_NEWER }, {}],
      [{}, { pending: new Set(["a"]), pushesInFlight: 1 }],
    ] as [Partial<EditorSessionViewState>, Partial<BrainsViewState>][]) {
      const markup = render(stateWith(fields), ["Chaser"], brainsFields);

      assert.doesNotMatch(markup, /<header\b/);
      assert.doesNotMatch(markup, /data-testid="app-header"/);
      assert.doesNotMatch(markup, /data-testid="project-name"/);
      assert.doesNotMatch(markup, /data-testid="status-dot"/);
      assert.doesNotMatch(markup, /data-testid="connection-status"/);
      assert.doesNotMatch(markup, /data-testid="save-status"/);
      assert.doesNotMatch(markup, /data-testid="save-dot"/);
      assert.doesNotMatch(markup, /data-testid="end-session-button"/);
    }
  });

  it("offers the Docs toggle alone in the upper right corner, above everything else, collapsed while the sidebar is closed", () => {
    const markup = render(stateWith({}), ["Chaser"]);
    const corner = /<div [^>]*data-testid="corner-controls"[^>]*>(.*?)<\/div>/.exec(markup);

    assert.ok(corner, "expected the corner controls");
    assert.match(corner[0], /\bclass="[^"]*\bjustify-end\b/);
    assert.equal(markup.indexOf("<div", 1), corner.index);
    const buttons = corner[1].match(/<button [^>]*>/g) ?? [];
    assert.equal(buttons.length, 1);
    assert.match(buttons[0] ?? "", /data-testid="docs-button"/);
    assert.match(buttons[0] ?? "", /aria-controls="docs-sidebar"/);
    assert.match(buttons[0] ?? "", /aria-expanded="false"/);
    assert.ok(markup.indexOf('data-testid="corner-controls"') < markup.indexOf("<main"));
  });

  it("carries the session's connection status on its root as data", () => {
    const cases: [Partial<EditorSessionViewState>, string][] = [
      [{}, "connected"],
      [{ status: "disconnected", connectedSinceOpen: false }, "connecting"],
      [{ status: "disconnected", errorCode: PeerSessionErrorCode.PROTOCOL_VERSION_NEWER }, "update"],
    ];
    for (const [fields, status] of cases) {
      assert.match(rootTag(render(stateWith(fields))), new RegExp(`data-status="${status}"`));
    }
  });

  it("carries the brains' save state and the facts behind it on its root as data", () => {
    assert.match(
      rootTag(render(stateWith({}), [], { pending: new Set(["a", "b"]), pushesInFlight: 1, reconciled: true })),
      /data-save-state="saving" data-pending="2" data-in-flight="1" data-reconciled="true"/
    );
    assert.match(
      rootTag(render(stateWith({}), [], { pending: new Set(["a"]), pushesInFlight: 0, reconciled: false })),
      /data-save-state="unsaved" data-pending="1" data-in-flight="0" data-reconciled="false"/
    );
    assert.match(
      rootTag(render(stateWith({}), [], { pending: new Set(), pushesInFlight: 0 })),
      /data-save-state="saved" data-pending="0"/
    );
  });

  it("stays quiet about a disconnection within the grace, keeping the session view rendered", () => {
    const markup = render(stateWith({ status: "disconnected" }), ["Chaser"]);

    assert.match(rootTag(markup), /data-status="connected"/);
    assert.match(markup, /data-testid="brain-list"/);
  });

  it("carries a disconnection past the grace as data alone, with no away card", () => {
    const markup = render(stateWith({ status: "disconnected", disconnectedBeyondGrace: true }), ["Chaser"]);

    assert.match(rootTag(markup), /data-status="reconnecting"/);
    assert.doesNotMatch(markup, /data-testid="end-session-button"/);
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

  it("shows the version notice with its reload remedy at once, below the corner and above the brain list", () => {
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
    assert.ok(markup.indexOf('data-testid="corner-controls"') < markup.indexOf('data-testid="version-notice"'));
    assert.ok(markup.indexOf('data-testid="version-notice"') < markup.indexOf('data-testid="brain-list"'));
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
    assert.match(rootTag(markup), /data-status="connecting"/);
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
