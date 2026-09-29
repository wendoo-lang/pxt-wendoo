import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SimxStatusView } from "./status-model.js";
import { copyText, renderStatusPanel } from "./status-panel.js";

/** A view in `state` with `fields` layered over it. */
function viewOf(state: SimxStatusView["state"], fields: Partial<SimxStatusView> = {}): SimxStatusView {
  return { state, joinCode: undefined, retrying: false, endFrom: undefined, ...fields };
}

/** The `data-action` of every control in `markup`, in document order. */
function actions(markup: string): string[] {
  return [...markup.matchAll(/data-action="([^"]+)"/g)].map((match) => match[1]);
}

/** The `data-tone` the status header of `markup` carries. */
function tone(markup: string): string | undefined {
  return /data-tone="([^"]+)"/.exec(markup)?.[1];
}

describe("simx status panel", () => {
  it("marks the panel root with the view's state", () => {
    for (const state of ["connecting", "code", "connected", "away", "ended", "update"] as const) {
      const markup = renderStatusPanel(viewOf(state, state === "code" ? { joinCode: "ribbon-lemur-whistle" } : {}));
      assert.match(markup, new RegExp(`^<section [^>]*data-testid="simx-status"[^>]*data-state="${state}"`));
      assert.equal(tone(markup), state);
    }
  });

  it("shows the join code with a copy control only while the view carries one", () => {
    const markup = renderStatusPanel(viewOf("code", { joinCode: "ribbon-lemur-whistle" }));

    assert.match(markup, /data-testid="join-code"[^>]*>ribbon-lemur-whistle</);
    assert.deepEqual(actions(markup), ["copy"]);
    assert.match(markup, /<button type="button"[^>]*aria-label="[^"]+"[^>]*data-action="copy"/);
    for (const state of ["connecting", "connected", "away", "ended", "update"] as const) {
      assert.doesNotMatch(renderStatusPanel(viewOf(state)), /data-testid="join-code"/);
    }
  });

  it("renders the join code as text", () => {
    const markup = renderStatusPanel(viewOf("code", { joinCode: '<b a="1">&' }));

    assert.match(markup, /data-testid="join-code"[^>]*>&lt;b a=&quot;1&quot;&gt;&amp;</);
    assert.doesNotMatch(markup, /<b /);
  });

  it("offers ending the session from connected and away, confirmation from confirm, and a new session from ended", () => {
    assert.deepEqual(actions(renderStatusPanel(viewOf("connected"))), ["end"]);
    assert.deepEqual(actions(renderStatusPanel(viewOf("away"))), ["end"]);
    assert.deepEqual(actions(renderStatusPanel(viewOf("confirm", { endFrom: "connected" }))), [
      "confirm-end",
      "cancel-end",
    ]);
    assert.deepEqual(actions(renderStatusPanel(viewOf("ended"))), ["start-new"]);
    assert.deepEqual(actions(renderStatusPanel(viewOf("connecting"))), []);
    assert.deepEqual(actions(renderStatusPanel(viewOf("update"))), []);
  });

  it("keeps the status of the view a confirmation is shown over", () => {
    assert.equal(tone(renderStatusPanel(viewOf("confirm", { endFrom: "connected" }))), "connected");
    assert.equal(tone(renderStatusPanel(viewOf("confirm", { endFrom: "away" }))), "away");
  });

  it("marks a connecting panel that is retrying", () => {
    assert.match(renderStatusPanel(viewOf("connecting", { retrying: true })), /^<section [^>]*data-retrying="true"/);
    assert.doesNotMatch(renderStatusPanel(viewOf("connecting")), /data-retrying="true"/);
  });

  it("gives every control a button type and an accessible name", () => {
    for (const view of [
      viewOf("code", { joinCode: "ribbon-lemur-whistle" }),
      viewOf("connected"),
      viewOf("away"),
      viewOf("confirm", { endFrom: "away" }),
      viewOf("ended"),
    ]) {
      const buttons = renderStatusPanel(view).match(/<button [^>]*>/g) ?? [];
      assert.ok(buttons.length > 0);
      for (const button of buttons) {
        assert.match(button, /type="button"/);
        assert.match(button, /aria-label="[^"]+"/);
      }
    }
  });
});

describe("copying text", () => {
  it("writes the text to the clipboard and reports it copied", async () => {
    const written: string[] = [];

    const copied = await copyText("ribbon-lemur-whistle", {
      writeText: async (text) => {
        written.push(text);
      },
    });

    assert.equal(copied, true);
    assert.deepEqual(written, ["ribbon-lemur-whistle"]);
  });

  it("reports nothing copied when the clipboard refuses the write", async () => {
    const copied = await copyText("ribbon-lemur-whistle", {
      writeText: () => Promise.reject(new DOMException("blocked by permissions policy", "NotAllowedError")),
    });

    assert.equal(copied, false);
  });

  it("reports nothing copied when there is no clipboard", async () => {
    assert.equal(await copyText("ribbon-lemur-whistle", undefined), false);
  });
});
