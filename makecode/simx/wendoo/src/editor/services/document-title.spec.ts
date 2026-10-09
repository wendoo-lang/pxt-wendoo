import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bindDocumentTitle, type ProjectNameSource, type TitleSurface } from "./document-title.js";

/** A source whose snapshot the test swaps, notifying its subscribers. */
function sourceOf(initial: string | undefined): ProjectNameSource & { set(name: string | undefined): void } {
  let projectName = initial;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return { projectName };
    },
    set(name) {
      projectName = name;
      for (const listener of listeners) listener();
    },
  };
}

describe("bindDocumentTitle", () => {
  it("names the project in the title once a name is known, and follows renames", () => {
    const surface: TitleSurface = { title: "" };
    const source = sourceOf(undefined);
    bindDocumentTitle(source, surface);

    assert.equal(surface.title, "Wendoo");
    source.set("Chase Game");
    assert.equal(surface.title, "Wendoo - Chase Game");
    source.set("Chase Game 2");
    assert.equal(surface.title, "Wendoo - Chase Game 2");
  });

  it("returns to the bare title when the name goes away, treating empty as none", () => {
    const surface: TitleSurface = { title: "" };
    const source = sourceOf("Chase Game");
    bindDocumentTitle(source, surface);

    assert.equal(surface.title, "Wendoo - Chase Game");
    source.set("");
    assert.equal(surface.title, "Wendoo");
    source.set(undefined);
    assert.equal(surface.title, "Wendoo");
  });

  it("stops following once unbound, leaving the title as it stands", () => {
    const surface: TitleSurface = { title: "" };
    const source = sourceOf("Chase Game");
    const unbind = bindDocumentTitle(source, surface);

    unbind();
    source.set("Another");
    assert.equal(surface.title, "Wendoo - Chase Game");
  });
});
