import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SimxStatusView } from "./status-model.js";
import { copyText, followLink, type OpenedTab, renderStatusPanel as renderWithEditor } from "./status-panel.js";

/** The editor base URL the specs render with. */
const EDITOR_URL = "http://localhost:5176";

/** The panel markup for `view`, linking to {@link EDITOR_URL}. */
function renderStatusPanel(view: SimxStatusView): string {
  return renderWithEditor(view, EDITOR_URL);
}

/** A view in `state` with `fields` layered over it. */
function viewOf(state: SimxStatusView["state"], fields: Partial<SimxStatusView> = {}): SimxStatusView {
  return { state, joinCode: undefined, retrying: false, endFrom: undefined, ...fields };
}

/** Every view the panel renders, the code view carrying `ribbon-lemur-whistle`. */
const ALL_VIEWS: SimxStatusView[] = [
  viewOf("connecting"),
  viewOf("connecting", { retrying: true }),
  viewOf("code", { joinCode: "ribbon-lemur-whistle" }),
  viewOf("connected"),
  viewOf("away"),
  viewOf("confirm", { endFrom: "connected" }),
  viewOf("ended"),
  viewOf("replaced"),
  viewOf("update"),
];

/** The opening tag of the link in `markup` carrying `data-link="<kind>"`, or `undefined` when there is none. */
function link(markup: string, kind: string): string | undefined {
  return new RegExp(`<a [^>]*data-link="${kind}"[^>]*>`).exec(markup)?.[0];
}

/** The `href` of the opening tag `tag`. */
function href(tag: string | undefined): string | undefined {
  return tag === undefined ? undefined : /href="([^"]*)"/.exec(tag)?.[1];
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
    for (const state of ["connecting", "code", "connected", "away", "ended", "replaced", "update"] as const) {
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
    for (const state of ["connecting", "connected", "away", "ended", "replaced", "update"] as const) {
      assert.doesNotMatch(renderStatusPanel(viewOf(state)), /data-testid="join-code"/);
    }
  });

  it("renders the join code as text", () => {
    const markup = renderStatusPanel(viewOf("code", { joinCode: '<b a="1">&' }));

    assert.match(markup, /data-testid="join-code"[^>]*>&lt;b a=&quot;1&quot;&gt;&amp;</);
    assert.doesNotMatch(markup, /<b /);
  });

  it("offers ending the session from connected and away, confirmation from confirm, a new session from ended, and nothing from replaced", () => {
    assert.deepEqual(actions(renderStatusPanel(viewOf("connected"))), ["end"]);
    assert.deepEqual(actions(renderStatusPanel(viewOf("away"))), ["end"]);
    assert.deepEqual(actions(renderStatusPanel(viewOf("confirm", { endFrom: "connected" }))), [
      "confirm-end",
      "cancel-end",
    ]);
    assert.deepEqual(actions(renderStatusPanel(viewOf("ended"))), ["start-new"]);
    assert.deepEqual(actions(renderStatusPanel(viewOf("replaced"))), []);
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

  it("links the logotype to the Wendoo homepage in a new tab, in every state", () => {
    for (const view of ALL_VIEWS) {
      const markup = renderStatusPanel(view);
      const home = link(markup, "home");

      assert.ok(home, `expected a homepage link in ${view.state}`);
      assert.equal(href(home), "https://wendoo.com");
      assert.match(home, /target="_blank"/);
      assert.match(home, /rel="noopener noreferrer"/);
      assert.match(home, /aria-label="[^"]+"/);
      assert.match(markup, /data-link="home"[^>]*><svg [^>]*aria-hidden="true"/);
    }
  });

  it("links to the editor, carrying the join code in the fragment, exactly while it shows the code", () => {
    const markup = renderStatusPanel(viewOf("code", { joinCode: "ribbon-lemur-whistle" }));
    const editor = link(markup, "editor");

    assert.equal(href(editor), "http://localhost:5176/#code=ribbon-lemur-whistle");
    assert.match(editor ?? "", /target="_blank"/);
    assert.match(editor ?? "", /rel="noopener noreferrer"/);
    for (const view of ALL_VIEWS.filter((candidate) => candidate.state !== "code")) {
      assert.equal(link(renderStatusPanel(view), "editor"), undefined, `expected no editor link in ${view.state}`);
    }
  });

  it("links to the editor with the current code: a rotated code's view carries the new code", () => {
    const before = renderStatusPanel(viewOf("code", { joinCode: "ribbon-lemur-whistle" }));
    const after = renderStatusPanel(viewOf("code", { joinCode: "maple-otter-drum" }));

    assert.equal(href(link(before, "editor")), "http://localhost:5176/#code=ribbon-lemur-whistle");
    assert.equal(href(link(after, "editor")), "http://localhost:5176/#code=maple-otter-drum");
  });

  it("links to the editor base it is given", () => {
    const markup = renderWithEditor(viewOf("code", { joinCode: "ribbon-lemur-whistle" }), "https://editor.example");

    assert.equal(href(link(markup, "editor")), "https://editor.example/#code=ribbon-lemur-whistle");
  });

  it("encodes the join code into the editor link", () => {
    const markup = renderStatusPanel(viewOf("code", { joinCode: 'a b&"<#' }));

    assert.equal(href(link(markup, "editor")), "http://localhost:5176/#code=a%20b%26%22%3C%23");
  });
});

describe("following a panel link", () => {
  /** A link the spec follows in place of a panel anchor. */
  function linkTo(url: string, kind: string): { href: string; outerHTML: string; dataset: { link?: string } } {
    return { href: url, outerHTML: `<a href="${url}" data-link="${kind}">link</a>`, dataset: { link: kind } };
  }

  it("opens the link's URL in a new tab with no way back to this frame", () => {
    const opens: [string, string][] = [];
    const tab: OpenedTab = { opener: {}, location: { href: "about:blank" } };
    const followed = linkTo("http://localhost:5176/#code=ribbon-lemur-whistle", "editor");

    const opened = followLink(followed, (url, target) => {
      opens.push([url, target]);
      return tab;
    });

    assert.equal(opened, true);
    assert.deepEqual(opens, [["", "_blank"]]);
    assert.equal(tab.opener, null);
    assert.equal(tab.location.href, "http://localhost:5176/#code=ribbon-lemur-whistle");
    assert.match(followed.outerHTML, /^<a /);
  });

  it("reveals the URL as selectable text in place of the link when the frame may not open a tab", () => {
    const followed = linkTo("http://localhost:5176/#code=ribbon-lemur-whistle", "editor");

    const opened = followLink(followed, () => null);

    assert.equal(opened, false);
    assert.match(
      followed.outerHTML,
      /^<span [^>]*data-testid="link-url"[^>]*data-link="editor"[^>]*>http:\/\/localhost:5176\/#code=ribbon-lemur-whistle<\/span>$/
    );
  });

  it("reveals the URL as text", () => {
    const followed = linkTo('https://wendoo.com/?q="<b>"&x', "home");

    followLink(followed, () => null);

    assert.match(followed.outerHTML, /data-link="home"[^>]*>https:\/\/wendoo.com\/\?q=&quot;&lt;b&gt;&quot;&amp;x</);
    assert.doesNotMatch(followed.outerHTML, /<b>/);
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
