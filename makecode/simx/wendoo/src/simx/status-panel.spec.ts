import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SimxEditorTab } from "../vendor/simxeditor.js";
import { followLink, mountBrandStrip, type OpenedTab, renderBrandStrip } from "./status-panel.js";

/** The one tab MakeCode lists for a project holding the arcade front door. */
const ONE_TAB: SimxEditorTab[] = [
  {
    key: "wendoo-lang/pxt-wendoo/makecode/extensions/arcade",
    label: "Wendoo",
    iconUrl: "https://example.com/wendoo-mark-small.svg",
  },
];

/** Three tabs MakeCode lists for a frame several registrations name, in the order it lists them. */
const SEVERAL_TABS: SimxEditorTab[] = [
  { key: "wendoo-lang/pxt-wendoo/makecode/extensions/arcade", label: "Wendoo" },
  { key: "owner/repo-designer", label: "Designer" },
  { key: "owner/repo-levels", label: "Levels" },
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

/** Matches the open-editor control, a button or a select with its content. */
const OPEN_EDITOR_CONTROL = /<(button|select) [^>]*data-action="open-editor"[^>]*>[\s\S]*?<\/\1>/;

/** The open-editor button in `markup`: its opening tag and its text, or `undefined` when there is none. */
function openEditorButton(markup: string): { tag: string; text: string } | undefined {
  const match = /(<button [^>]*data-action="open-editor"[^>]*>)([^<]*)<\/button>/.exec(markup);
  return match === null ? undefined : { tag: match[1], text: match[2] };
}

/** Every option of the open-editor select in `markup`, in document order: its opening tag, value and text. */
function openEditorOptions(markup: string): { tag: string; value: string; text: string }[] {
  const select = /<select [^>]*data-action="open-editor"[^>]*>([\s\S]*?)<\/select>/.exec(markup)?.[1] ?? "";
  return [...select.matchAll(/(<option value="([^"]*)"[^>]*>)([^<]*)<\/option>/g)].map((match) => ({
    tag: match[1],
    value: match[2],
    text: match[3],
  }));
}

/**
 * A strip root holding its markup as text: it serves the element operations
 * the strip makes on its root -- finding the header to insert markup at its
 * end and finding the open-editor control to remove it -- and records its
 * listeners by event type.
 */
class FakeRoot {
  innerHTML = "";
  readonly listeners = new Map<string, (event: unknown) => void>();

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  querySelector(selector: string): unknown {
    if (selector === ".head") {
      return {
        insertAdjacentHTML: (position: string, html: string) => {
          assert.equal(position, "beforeend");
          this.innerHTML = this.innerHTML.replace("</header>", `${html}</header>`);
        },
      };
    }
    if (selector === '[data-action="open-editor"]') {
      const control = OPEN_EDITOR_CONTROL.exec(this.innerHTML)?.[0];
      if (control === undefined) return null;
      return {
        remove: () => {
          this.innerHTML = this.innerHTML.replace(control, "");
        },
      };
    }
    throw new Error(`unexpected selector ${selector}`);
  }

  /** Delivers `event` to the listener for `type`. */
  dispatch(type: string, event: unknown): void {
    this.listeners.get(type)?.(event);
  }
}

/** A click event whose target resolves `[data-action]` to `control`. */
function clickOn(control: { dataset: { action: string; key?: string } }): { target: unknown } {
  return { target: { closest: (selector: string) => (selector === "[data-action]" ? control : null) } };
}

describe("simx brand strip", () => {
  it("shows the logotype alone, linking to the Wendoo homepage in a new tab, for no tab", () => {
    const markup = renderBrandStrip([]);
    const home = link(markup, "home");

    assert.match(markup, /^<section [^>]*data-testid="simx-strip"/);
    assert.equal(href(home), "https://wendoo.com");
    assert.match(home ?? "", /target="_blank"/);
    assert.match(home ?? "", /rel="noopener noreferrer"/);
    assert.deepEqual(actions(markup), []);
    assert.equal((markup.match(/<a /g) ?? []).length, 1);
  });

  it("shows a button opening the one tab, after the logotype, for one tab", () => {
    const markup = renderBrandStrip(ONE_TAB);
    const button = openEditorButton(markup);

    assert.deepEqual(actions(markup), ["open-editor"]);
    assert.ok(button !== undefined);
    assert.ok(markup.indexOf(button.tag) > markup.indexOf(link(markup, "home") ?? "<a "));
    assert.match(button.tag, /type="button"/);
    assert.match(button.tag, /aria-label="[^"]+"/);
    assert.match(button.tag, new RegExp(`data-key="${ONE_TAB[0].key}"`));
    assert.ok(button.text.includes(ONE_TAB[0].label));
    assert.doesNotMatch(markup, /<select /);
  });

  it("shows a select offering each tab in order, after a selected and disabled first option, for several tabs", () => {
    const markup = renderBrandStrip(SEVERAL_TABS);
    const options = openEditorOptions(markup);

    assert.deepEqual(actions(markup), ["open-editor"]);
    assert.ok(markup.indexOf("<select ") > markup.indexOf(link(markup, "home") ?? "<a "));
    assert.deepEqual(
      options.map((option) => option.value),
      ["", ...SEVERAL_TABS.map((tab) => tab.key)]
    );
    assert.match(options[0].tag, /\sselected[\s>]/);
    assert.match(options[0].tag, /\sdisabled[\s>]/);
    assert.deepEqual(
      options.slice(1).map((option) => option.text),
      SEVERAL_TABS.map((tab) => tab.label)
    );
    for (const option of options.slice(1)) {
      assert.doesNotMatch(option.tag, /selected|disabled/);
    }
    assert.doesNotMatch(markup, /<button /);
  });

  it("writes tab keys and labels as text", () => {
    const one = renderBrandStrip([{ key: 'owner/"repo"', label: "<b>Levels</b> & more" }]);
    const several = renderBrandStrip([
      { key: 'owner/"repo"', label: "<b>Levels</b> & more" },
      { key: "owner/<other>", label: "Designer" },
    ]);

    assert.match(openEditorButton(one)?.tag ?? "", /data-key="owner\/&quot;repo&quot;"/);
    assert.ok(openEditorButton(one)?.text.includes("&lt;b&gt;Levels&lt;/b&gt; &amp; more"));
    assert.deepEqual(
      openEditorOptions(several).map((option) => option.value),
      ["", "owner/&quot;repo&quot;", "owner/&lt;other&gt;"]
    );
    assert.equal(openEditorOptions(several)[1].text, "&lt;b&gt;Levels&lt;/b&gt; &amp; more");
    assert.doesNotMatch(one + several, /<b>/);
  });

  it("renders the logotype alone at mount, and the control for the tabs it is given after", () => {
    const root = new FakeRoot();
    const strip = mountBrandStrip(root as unknown as HTMLElement, () => {});

    assert.equal(root.innerHTML, renderBrandStrip([]));
    strip.setTabs(ONE_TAB);
    assert.equal(root.innerHTML, renderBrandStrip(ONE_TAB));
    strip.setTabs(SEVERAL_TABS);
    assert.equal(root.innerHTML, renderBrandStrip(SEVERAL_TABS));
    strip.setTabs([]);
    assert.equal(root.innerHTML, renderBrandStrip([]));
    assert.ok(link(root.innerHTML, "home") !== undefined);
    strip.unmount();
  });

  it("replaces only the control when given tabs, leaving the logotype as it is", () => {
    const root = new FakeRoot();
    const strip = mountBrandStrip(root as unknown as HTMLElement, () => {});
    const revealed = '<span class="link-url" data-testid="link-url" data-link="home">https://wendoo.com/</span>';
    root.innerHTML = root.innerHTML.replace(/<a [\s\S]*?<\/a>/, revealed);

    strip.setTabs(SEVERAL_TABS);
    assert.ok(root.innerHTML.includes(`${revealed}<select `));
    strip.setTabs([]);
    assert.ok(root.innerHTML.includes(`${revealed}</header>`));
    assert.deepEqual(actions(root.innerHTML), []);
    strip.unmount();
  });

  it("opens the key the button carries when it is clicked, and nothing once unmounted", () => {
    const root = new FakeRoot();
    const opened: string[] = [];
    const strip = mountBrandStrip(root as unknown as HTMLElement, (key) => {
      opened.push(key);
    });
    strip.setTabs(ONE_TAB);

    root.dispatch("click", clickOn({ dataset: { action: "open-editor", key: ONE_TAB[0].key } }));
    assert.deepEqual(opened, [ONE_TAB[0].key]);

    strip.unmount();
    assert.deepEqual([...root.listeners.keys()], []);
  });

  it("opens nothing when the select is clicked", () => {
    const root = new FakeRoot();
    const opened: string[] = [];
    const strip = mountBrandStrip(root as unknown as HTMLElement, (key) => {
      opened.push(key);
    });

    root.dispatch("click", clickOn({ dataset: { action: "open-editor" } }));
    assert.deepEqual(opened, []);
    strip.unmount();
  });

  it("opens the tab chosen in the select and returns the select to its first option", () => {
    const root = new FakeRoot();
    const opened: string[] = [];
    const strip = mountBrandStrip(root as unknown as HTMLElement, (key) => {
      opened.push(key);
    });
    strip.setTabs(SEVERAL_TABS);
    const select = { dataset: { action: "open-editor" }, value: SEVERAL_TABS[1].key };

    root.dispatch("change", { target: select });
    assert.deepEqual(opened, [SEVERAL_TABS[1].key]);
    assert.equal(select.value, "");

    root.dispatch("change", { target: select });
    assert.deepEqual(opened, [SEVERAL_TABS[1].key]);
    strip.unmount();
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
