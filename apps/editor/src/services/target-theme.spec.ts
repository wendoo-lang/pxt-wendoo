import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyTargetTheme,
  bindTargetTheme,
  resolveTarget,
  TARGET_THEMES,
  type TargetTheme,
  THEME_TOKENS,
  type ThemeSurface,
} from "./target-theme.js";

/** A surface recording the custom properties written onto it. */
interface RecordingSurface extends ThemeSurface {
  value(property: string): string | undefined;
  readonly properties: ReadonlyMap<string, string>;
}

function recordingSurface(): RecordingSurface {
  const values = new Map<string, string>();
  return {
    properties: values,
    value: (property) => values.get(property),
    style: {
      setProperty(property, value) {
        values.set(property, value);
      },
      removeProperty(property) {
        const previous = values.get(property) ?? "";
        values.delete(property);
        return previous;
      },
    },
  };
}

/** A store stand-in whose declared target the test sets. */
function targetSource(initial: string | undefined) {
  let snapshot = { target: initial };
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    declare(target: string | undefined) {
      snapshot = { target };
      for (const listener of listeners) listener();
    },
  };
}

/** Themes carrying one override, standing in for a record that ships a palette. */
const OVERRIDING_THEMES: ReadonlyMap<string, TargetTheme> = new Map([
  ["tinted", { displayName: "Tinted", tokens: { "--color-brain-accent": "#123456", "--color-success": "#00aa00" } }],
  ["plain", { displayName: "Plain", tokens: {} }],
]);

/** Every `--color-*` custom property declared in the CSS file at `relativePath` from this spec. */
function declaredColorTokens(relativePath: string): string[] {
  const css = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
  return [...css.matchAll(/(--color-[a-z0-9-]+)\s*:/g)].map((match) => match[1]);
}

describe("resolveTarget", () => {
  it("resolves arcade to its display name, its token overrides and its tile colors", () => {
    const arcade = resolveTarget("arcade");

    assert.equal(arcade?.id, "arcade");
    assert.equal(arcade?.displayName, "Arcade");
    assert.ok(Object.keys(arcade?.tokens ?? {}).length > 0);
    assert.notEqual(arcade?.tileColors, undefined);
  });

  it("resolves micro:bit to its display name, with no token overrides and no tile colors", () => {
    assert.deepEqual(resolveTarget("microbit"), {
      id: "microbit",
      displayName: "micro:bit",
      tokens: {},
      tileColors: undefined,
    });
  });

  it("resolves an undeclared target to nothing", () => {
    assert.equal(resolveTarget(undefined), undefined);
    assert.equal(resolveTarget(""), undefined);
  });

  it("resolves a non-string declaration to nothing, as undeclared", () => {
    assert.equal(resolveTarget(42), undefined);
    assert.equal(resolveTarget({ id: "arcade" }), undefined);
    assert.equal(resolveTarget(null), undefined);
  });

  it("resolves an unrecognized id to the raw id with the default theme, including ids naming object members", () => {
    assert.deepEqual(resolveTarget("gameboy"), {
      id: "gameboy",
      displayName: "gameboy",
      tokens: {},
      tileColors: undefined,
    });
    assert.deepEqual(resolveTarget("constructor"), {
      id: "constructor",
      displayName: "constructor",
      tokens: {},
      tileColors: undefined,
    });
  });
});

describe("the themeable token set", () => {
  it("holds every color token the shared UI contract declares, the brain editor's included", () => {
    const members = new Set<string>(THEME_TOKENS);
    const declared = declaredColorTokens("../../../../external/wendoo-lang/packages/ui/src/ui.css");

    assert.ok(declared.includes("--color-brain-accent"));
    for (const token of declared) assert.ok(members.has(token), `${token} is not in the themeable set`);
  });

  it("holds every color token the editor's own default theme declares", () => {
    const members = new Set<string>(THEME_TOKENS);
    for (const token of declaredColorTokens("../globals.css")) {
      assert.ok(members.has(token), `${token} is not in the themeable set`);
    }
  });

  it("ships records whose overrides are all members of the set", () => {
    const members = new Set<string>(THEME_TOKENS);
    for (const [id, theme] of TARGET_THEMES) {
      for (const token of Object.keys(theme.tokens)) assert.ok(members.has(token), `${id} overrides ${token}`);
    }
  });
});

describe("applyTargetTheme", () => {
  it("writes a theme's overrides and removes themeable tokens it does not override", () => {
    const surface = recordingSurface();

    applyTargetTheme(surface, { "--color-brain-accent": "#123456", "--color-warning": "#ffaa00" });
    applyTargetTheme(surface, { "--color-brain-accent": "#654321" });

    assert.deepEqual([...surface.properties], [["--color-brain-accent", "#654321"]]);
  });
});

describe("bindTargetTheme", () => {
  it("applies the declared target's overrides at once, and removes them when the target becomes undeclared", () => {
    const surface = recordingSurface();
    const source = targetSource("tinted");

    bindTargetTheme(source, surface, OVERRIDING_THEMES);
    assert.equal(surface.value("--color-brain-accent"), "#123456");
    assert.equal(surface.value("--color-success"), "#00aa00");

    source.declare(undefined);
    assert.equal(surface.properties.size, 0);
  });

  it("swaps overrides as the declared target changes, and falls back to the default theme for an unrecognized id", () => {
    const surface = recordingSurface();
    const source = targetSource(undefined);

    bindTargetTheme(source, surface, OVERRIDING_THEMES);
    assert.equal(surface.properties.size, 0);

    source.declare("tinted");
    assert.equal(surface.value("--color-brain-accent"), "#123456");

    source.declare("plain");
    assert.equal(surface.properties.size, 0);

    source.declare("tinted");
    source.declare("gameboy");
    assert.equal(surface.properties.size, 0);
  });

  it("themes the surface for arcade from the shipped record, setting every override it carries", () => {
    const surface = recordingSurface();
    const overrides = Object.keys(TARGET_THEMES.get("arcade")?.tokens ?? {});

    bindTargetTheme(targetSource("arcade"), surface);

    assert.ok(overrides.includes("--color-brain-desk-from"));
    assert.ok(overrides.includes("--color-header"));
    assert.deepEqual([...surface.properties.keys()].sort(), [...overrides].sort());
  });

  it("leaves the default theme standing from the shipped record while no target, or an unknown one, is declared", () => {
    const surface = recordingSurface();
    const source = targetSource(undefined);

    bindTargetTheme(source, surface);
    assert.equal(surface.properties.size, 0);

    source.declare("arcade");
    assert.notEqual(surface.value("--color-brain-desk-from"), undefined);

    source.declare("gameboy");
    assert.equal(surface.properties.size, 0);

    source.declare("arcade");
    source.declare(undefined);
    assert.equal(surface.properties.size, 0);
  });
});
