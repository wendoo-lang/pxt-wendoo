/**
 * Specs for `BrainEditor`: it mounts over a brains store, with and without a
 * session catalog, and its render completes.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrainsProvider } from "../contexts/brains.js";
import type { BrainsSessionState } from "../services/brains-store.js";
import { BrainsStore } from "../services/brains-store.js";
import { BrainEditor } from "./BrainEditor.js";

/** A connected session carrying `catalogText`, as a brains store follows it. */
function session(catalogText: string | undefined) {
  return {
    subscribe: () => () => {},
    getSnapshot: (): BrainsSessionState => ({ status: "connected", catalogText }),
  };
}

/** Renders the editor on brain `brainId` over `store`. */
function render(store: BrainsStore, brainId: string): string {
  return renderToStaticMarkup(
    createElement(BrainsProvider, { value: store }, createElement(BrainEditor, { brainId, onClose: () => {} }))
  );
}

describe("BrainEditor", () => {
  it("mounts the brain editor dialog on a stored brain", () => {
    const store = new BrainsStore(session(undefined));
    const id = store.addBrain("Chaser");

    assert.equal(typeof render(store, id), "string");
  });

  it("mounts over an environment built from a session catalog", () => {
    const store = new BrainsStore(session('{"packs":[{"name":"motion","tiles":[{"name":"move"}]}]}'));
    const id = store.addBrain("Chaser");

    assert.equal(typeof render(store, id), "string");
  });
});
