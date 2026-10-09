/**
 * Specs for `BrainEditor`: it mounts over a brains store, with and without a
 * session catalog, and its render completes; and for `BrainEditorSession`,
 * the continuous dialog it stands over one editing of a brain.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DocsSidebarProvider } from "@wendoo/docs";
import { BrainEditorDialog } from "@wendoo/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BrainEditing } from "../brain/editing.js";
import { buildBrainEditorConfig } from "../brain/editor-config.js";
import { BrainsProvider } from "../contexts/brains.js";
import type { BrainsSessionState } from "../services/brains-store.js";
import { BrainsStore } from "../services/brains-store.js";
import { elementsIn } from "../test-support/element-tree.js";
import { BrainEditor, BrainEditorSession } from "./BrainEditor.js";

/** A connected session carrying `catalogText`, as a brains store follows it. */
function session(catalogText: string | undefined) {
  return {
    subscribe: () => () => {},
    getSnapshot: (): BrainsSessionState => ({ status: "connected", catalogText, assets: undefined }),
  };
}

/** Renders the editor on brain `brainId` over `store`, under a docs sidebar. */
function render(store: BrainsStore, brainId: string): string {
  return renderToStaticMarkup(
    createElement(
      BrainsProvider,
      { value: store },
      createElement(DocsSidebarProvider, null, createElement(BrainEditor, { brainId, onClose: () => {} }))
    )
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

describe("BrainEditorSession", () => {
  /** An editing of a stored brain that records its calls, and the session standing over it. */
  function standing() {
    const store = new BrainsStore(session(undefined));
    const id = store.addBrain("Chaser");
    const calls: string[] = [];
    const editing: BrainEditing = {
      srcBrainDef: store.getBrain(id),
      change: () => {
        calls.push("change");
      },
      close: () => {
        calls.push("close");
      },
    };
    const tree = BrainEditorSession({
      config: buildBrainEditorConfig(
        store.getSnapshot().environment,
        store.getSnapshot().assetLiterals,
        store.getSnapshot().brainLiterals,
        store.getSnapshot().packLiterals,
        store.getSnapshot().typeIcons
      ),
      editing,
      isOpen: true,
      onOpenChange: (open) => {
        calls.push(`open:${open}`);
      },
    });
    const dialogs = elementsIn(tree).filter((element) => element.type === BrainEditorDialog);
    assert.equal(dialogs.length, 1);
    const dialog = dialogs[0];
    assert.ok(dialog);
    return { editing, calls, dialog };
  }

  it("stands a continuous dialog on the editing's document, handing every edit to the editing", () => {
    const { editing, dialog } = standing();

    assert.equal(dialog.props.continuous, true);
    assert.equal(dialog.props.isOpen, true);
    assert.equal(dialog.props.srcBrainDef, editing.srcBrainDef);
    assert.equal(dialog.props.onChange, editing.change);
    assert.equal(dialog.props.onSubmit, undefined);
  });

  it("flushes the editing before reporting the dialog closed", () => {
    const { calls, dialog } = standing();

    (dialog.props.onOpenChange as (open: boolean) => void)(false);

    assert.deepEqual(calls, ["close", "open:false"]);
  });
});
