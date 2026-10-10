import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { followLink, mountBrandStrip, type OpenedTab, renderBrandStrip } from "./status-panel.js";

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

describe("simx brand strip", () => {
  it("shows the logotype, linking to the Wendoo homepage in a new tab, and the open editor button alone", () => {
    const markup = renderBrandStrip();
    const home = link(markup, "home");

    assert.match(markup, /^<section [^>]*data-testid="simx-strip"/);
    assert.equal(href(home), "https://wendoo.com");
    assert.match(home ?? "", /target="_blank"/);
    assert.match(home ?? "", /rel="noopener noreferrer"/);
    assert.deepEqual(actions(markup), ["open-editor"]);
    assert.equal((markup.match(/<a /g) ?? []).length, 1);
    for (const button of markup.match(/<button [^>]*>/g) ?? []) {
      assert.match(button, /type="button"/);
      assert.match(button, /aria-label="[^"]+"/);
    }
  });

  it("calls its open editor action when the button is clicked, and nothing once unmounted", () => {
    let listener: ((event: MouseEvent) => void) | undefined;
    const root = {
      innerHTML: "",
      addEventListener(_type: "click", added: (event: MouseEvent) => void) {
        listener = added;
      },
      removeEventListener(_type: "click", removed: (event: MouseEvent) => void) {
        if (listener === removed) listener = undefined;
      },
    };
    let opened = 0;
    const unmount = mountBrandStrip(root as unknown as HTMLElement, () => {
      opened += 1;
    });
    const button = { dataset: { action: "open-editor" } };
    const target = { closest: (selector: string) => (selector === "[data-action]" ? button : null) };

    assert.equal(root.innerHTML, renderBrandStrip());
    listener?.({ target } as unknown as MouseEvent);
    assert.equal(opened, 1);

    unmount();
    assert.equal(listener, undefined);
  });
});

describe("following a strip link", () => {
  /** A link the spec follows in place of a strip anchor. */
  function linkTo(url: string, kind: string): { href: string; outerHTML: string; dataset: { link?: string } } {
    return { href: url, outerHTML: `<a href="${url}" data-link="${kind}">link</a>`, dataset: { link: kind } };
  }

  it("opens the link's URL in a new tab with no way back to this frame", () => {
    const opens: [string, string][] = [];
    const tab: OpenedTab = { opener: {}, location: { href: "about:blank" } };
    const followed = linkTo("https://wendoo.com/", "home");

    const opened = followLink(followed, (url, target) => {
      opens.push([url, target]);
      return tab;
    });

    assert.equal(opened, true);
    assert.deepEqual(opens, [["", "_blank"]]);
    assert.equal(tab.opener, null);
    assert.equal(tab.location.href, "https://wendoo.com/");
    assert.match(followed.outerHTML, /^<a /);
  });

  it("reveals the URL as selectable text in place of the link when the frame may not open a tab", () => {
    const followed = linkTo("https://wendoo.com/", "home");

    const opened = followLink(followed, () => null);

    assert.equal(opened, false);
    assert.match(
      followed.outerHTML,
      /^<span [^>]*data-testid="link-url"[^>]*data-link="home"[^>]*>https:\/\/wendoo.com\/<\/span>$/
    );
  });

  it("reveals the URL as text", () => {
    const followed = linkTo('https://wendoo.com/?q="<b>"&x', "home");

    followLink(followed, () => null);

    assert.match(followed.outerHTML, /data-link="home"[^>]*>https:\/\/wendoo.com\/\?q=&quot;&lt;b&gt;&quot;&amp;x</);
    assert.doesNotMatch(followed.outerHTML, /<b>/);
  });
});
