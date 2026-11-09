/**
 * Specs for `BrainEditor`: it mounts over a brains store, with and without a
 * session catalog, and its render completes; and for `BrainEditorSession`,
 * the continuous dialog it stands over one editing of a brain, on the
 * editing's document.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrainDef } from "@wendoo/core/app";
import { DocsSidebarProvider } from "@wendoo/docs";
import { BrainEditorDialog } from "@wendoo/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BrainEditing } from "../brain/editing.js";
import { openBrainEditing } from "../brain/editing.js";
import { buildBrainEditorConfig } from "../brain/editor-config.js";
import { BrainsProvider } from "../contexts/brains.js";
import type { BrainsSessionState } from "../services/brains-store.js";
import { BrainsStore } from "../services/brains-store.js";
import { elementsIn } from "../test-support/element-tree.js";
import { seedBrain } from "../test-support/seed-brain.js";
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
    const id = seedBrain(store, "Chaser");

    assert.equal(typeof render(store, id), "string");
  });

  it("mounts over an environment built from a session catalog", () => {
    const store = new BrainsStore(session('{"packs":[{"name":"motion","tiles":[{"name":"move"}]}]}'));
    const id = seedBrain(store, "Chaser");

    assert.equal(typeof render(store, id), "string");
  });
});

describe("BrainEditorSession", () => {
  /** The continuous dialog a session over `editing` stands, on `editing`'s current document. */
  function dialogOver(store: BrainsStore, editing: BrainEditing, onOpenChange: (open: boolean) => void = () => {}) {
    const tree = BrainEditorSession({
      config: buildBrainEditorConfig(
        store.getSnapshot().environment,
        store.getSnapshot().assetLiterals,
        store.getSnapshot().brainLiterals,
        store.getSnapshot().packLiterals,
        store.getSnapshot().typeIcons,
        store.getSnapshot().typeLabels
      ),
      editing,
      srcBrainDef: editing.getDocument(),
      isOpen: true,
      onOpenChange,
    });
    const dialogs = elementsIn(tree).filter((element) => element.type === BrainEditorDialog);
    assert.equal(dialogs.length, 1);
    const dialog = dialogs[0];
    assert.ok(dialog);
    return dialog;
  }

  /** An editing of a stored brain that records its calls, and the session standing over it. */
  function standing() {
    const store = new BrainsStore(session(undefined));
    const id = seedBrain(store, "Chaser");
    const calls: string[] = [];
    const editing: BrainEditing = {
      ...openBrainEditing(store, id),
      change: () => {
        calls.push("change");
      },
      close: () => {
        calls.push("close");
      },
    };
    const dialog = dialogOver(store, editing, (open) => {
      calls.push(`open:${open}`);
    });
    return { editing, calls, dialog };
  }

  it("stands a continuous dialog on the editing's document, handing every edit to the editing", () => {
    const { editing, dialog } = standing();

    assert.equal(dialog.props.continuous, true);
    assert.equal(dialog.props.isOpen, true);
    assert.ok(editing.getDocument());
    assert.equal(dialog.props.srcBrainDef, editing.getDocument());
    assert.equal(dialog.props.onChange, editing.change);
    assert.equal(dialog.props.onSubmit, undefined);
  });

  it("stands the dialog on the store's newer version of the brain once the editing adopts it", () => {
    const store = new BrainsStore(session(undefined));
    const id = seedBrain(store, "Chaser");
    const editing = openBrainEditing(store, id);
    let notified = 0;
    editing.subscribe(() => {
      notified += 1;
    });
    const before = dialogOver(store, editing);

    store.renameBrain(id, "Runner");
    const after = dialogOver(store, editing);

    assert.equal(notified, 1);
    assert.notEqual(after.props.srcBrainDef, before.props.srcBrainDef);
    assert.equal(after.props.srcBrainDef, editing.getDocument());
    assert.equal((after.props.srcBrainDef as BrainDef | undefined)?.id(), id);
  });

  it("closes the editing before reporting the dialog closed", () => {
    const { calls, dialog } = standing();

    (dialog.props.onOpenChange as (open: boolean) => void)(false);

    assert.deepEqual(calls, ["close", "open:false"]);
  });
});
