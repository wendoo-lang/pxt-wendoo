import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { elementByTestId, elementsIn } from "../test-support/element-tree.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { EndSessionAction } from "./EndSession.js";

/** Records every call the action makes to its handler and its session store, in order. */
function recorder() {
  const calls: string[] = [];
  return {
    calls,
    onConfirmingChange: (confirming: boolean) => {
      calls.push(`confirming:${confirming}`);
    },
    session: {
      forget: () => {
        calls.push("forget");
      },
    },
  };
}

/** The confirmation dialogs in `tree`. */
function dialogsIn(tree: ReturnType<typeof EndSessionAction>) {
  return elementsIn(tree).filter((element) => element.type === ConfirmDialog);
}

describe("EndSessionAction", () => {
  it("offers the end button with no confirmation open", () => {
    const tree = EndSessionAction({ confirming: false, ...recorder() });

    assert.equal(elementByTestId(tree, "end-session-button").type, "button");
    assert.equal(dialogsIn(tree).length, 0);
  });

  it("opens the confirmation from the button, and ends nothing", () => {
    const handlers = recorder();
    const tree = EndSessionAction({ confirming: false, ...handlers });

    (elementByTestId(tree, "end-session-button").props.onClick as () => void)();

    assert.deepEqual(handlers.calls, ["confirming:true"]);
  });

  it("confirms destructively; confirming ends the session through the store", () => {
    const handlers = recorder();
    const tree = EndSessionAction({ confirming: true, ...handlers });
    const dialogs = dialogsIn(tree);

    assert.equal(dialogs.length, 1);
    const dialog = dialogs[0];
    assert.ok(dialog);
    assert.equal(dialog.props.destructive, true);
    (dialog.props.onConfirm as () => void)();

    assert.deepEqual(handlers.calls, ["forget"]);
  });

  it("closes the confirmation on cancel, ending nothing", () => {
    const handlers = recorder();
    const dialog = dialogsIn(EndSessionAction({ confirming: true, ...handlers }))[0];
    assert.ok(dialog);

    (dialog.props.onClose as () => void)();

    assert.deepEqual(handlers.calls, ["confirming:false"]);
  });
});
