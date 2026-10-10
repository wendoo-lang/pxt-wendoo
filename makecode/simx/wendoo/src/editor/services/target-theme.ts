import type { BrainTileKind } from "@wendoo/core/app";
import type { TileColorDef } from "@wendoo/ui";

/**
 * The editor's themeable token set: every CSS custom property a target theme
 * may override. It holds the semantic color contract `@wendoo/ui` declares in
 * `ui.css` -- the tokens the editor's own UI and the shared components paint
 * with -- and the brain editor's `--color-brain-*` and `--shadow-brain-*`
 * tokens. A target theme may override any of them.
 *
 * Every color the editor's UI paints is one of these tokens, used through its
 * Tailwind utility (`bg-success`, `text-muted-foreground`) or `var()`; no
 * component writes a color literal. A token the editor adds for a role no
 * existing token fits is declared in `globals.css`, which gives its default
 * value, and is added here.
 */
export const THEME_TOKENS = [
  "--color-background",
  "--color-foreground",
  "--color-card",
  "--color-card-foreground",
  "--color-popover",
  "--color-popover-foreground",
  "--color-panel",
  "--color-panel-foreground",
  "--color-primary",
  "--color-primary-foreground",
  "--color-secondary",
  "--color-secondary-foreground",
  "--color-muted",
  "--color-muted-foreground",
  "--color-accent",
  "--color-accent-foreground",
  "--color-destructive",
  "--color-destructive-foreground",
  "--color-success",
  "--color-success-foreground",
  "--color-warning",
  "--color-warning-foreground",
  "--color-border",
  "--color-input",
  "--color-ring",
  "--color-brain-desk-from",
  "--color-brain-desk-to",
  "--color-brain-desk-glow",
  "--color-brain-desk-shade",
  "--color-brain-rule-from",
  "--color-brain-rule-to",
  "--shadow-brain-rule",
  "--color-brain-panel",
  "--color-brain-armed",
  "--color-brain-tile-border",
  "--color-brain-accent",
  "--color-brain-accent-ink",
  "--color-brain-on-accent",
  "--color-brain-ink",
  "--color-brain-recess",
  "--color-brain-inline-ink",
  "--color-brain-amber",
  "--color-brain-amber-ink",
  "--color-brain-amber-wash",
  "--color-brain-warn",
  "--color-brain-warn-edge",
  "--color-brain-warn-ink",
  "--color-brain-timed",
  "--color-brain-timed-ink",
  "--color-brain-capsule",
  "--color-brain-capsule-edge",
  "--color-brain-capsule-ink",
  "--color-brain-capsule-otherwise",
  "--color-brain-capsule-otherwise-edge",
  "--color-brain-capsule-otherwise-ink",
  "--color-brain-capsule-then",
  "--color-brain-capsule-then-edge",
  "--color-brain-capsule-then-ink",
  "--color-brain-pill",
  "--color-brain-pill-hover",
  "--color-brain-pill-edge",
  "--color-brain-pill-ink",
] as const;

/** One member of {@link THEME_TOKENS}. */
export type ThemeToken = (typeof THEME_TOKENS)[number];

/**
 * Values that replace the default theme's, keyed by token; a token left out
 * keeps its default. Each value is a CSS value of its token's kind: a color
 * for a `--color-*` token, a `box-shadow` value for a `--shadow-*` one.
 */
export type ThemeTokenOverrides = Readonly<Partial<Record<ThemeToken, string>>>;

/**
 * The WHEN/DO fill pair each kind of tile is drawn in, keyed by tile kind.
 * Colors are six-digit hex strings, as `TileColorDef` takes them.
 */
export type TileKindColors = Readonly<Record<BrainTileKind, TileColorDef>>;

/** How the editor themes for one MakeCode target. */
export interface TargetTheme {
  /** The token overrides applied while this target is declared; empty for the default theme. */
  readonly tokens: ThemeTokenOverrides;
  /** The tile fills worn while this target is declared; absent where tiles keep the brain editor's default hue. */
  readonly tileColors?: TileKindColors;
}

/** A fill pair drawing both sides of a rule in `hue`. */
function bothSides(hue: string): TileColorDef {
  return { when: hue, do: hue };
}

/**
 * Arcade's theme: MakeCode's arcade-light purple accents over a teal-tinted
 * paper desk of white rule cards, teal capsules and teal-cast shadows, and
 * tiles filled in light pastels under dark ink. Tokens it leaves out take the
 * editor's default light theme.
 */
const ARCADE_THEME: TargetTheme = {
  tokens: {
    "--color-primary": "#5d4fba",
    "--color-border": "#d4e0e3",
    "--color-brain-desk-from": "#eef4f6",
    "--color-brain-desk-to": "#e2ecef",
    "--color-brain-desk-shade": "rgba(17, 110, 121, 0.09)",
    "--color-brain-rule-to": "#f6fafb",
    "--shadow-brain-rule": "0 2px 8px rgba(17, 110, 121, 0.1)",
    "--color-brain-panel": "#f4f8f9",
    "--color-brain-armed": "#5d4fba",
    "--color-brain-accent": "#5d4fba",
    "--color-brain-accent-ink": "#5d4fba",
    "--color-brain-ink": "#1c2a2e",
    "--color-brain-inline-ink": "#1c2a2e",
    "--color-brain-capsule": "#0e606a",
    "--color-brain-capsule-edge": "#0b454c",
    "--color-brain-capsule-ink": "#ffffff",
  },
  tileColors: {
    sensor: bothSides("#ffe9c7"),
    output: bothSides("#ffe9c7"),
    actuator: bothSides("#d5e8ff"),
    accessor: bothSides("#d5e8ff"),
    literal: bothSides("#e9f7e6"),
    variable: bothSides("#e9f7e6"),
    factory: bothSides("#e9f7e6"),
    modifier: bothSides("#eef1f4"),
    operator: bothSides("#eef1f4"),
    parameter: bothSides("#eef1f4"),
    controlFlow: bothSides("#eef1f4"),
    page: bothSides("#eef1f4"),
    missing: bothSides("#eef1f4"),
    undefined: bothSides("#eef1f4"),
  },
};

/**
 * The per-target record: each known MakeCode target's {@link TargetTheme},
 * keyed by the target id the MakeCode side declares in the session. Add an
 * entry here to support a new target.
 */
export const TARGET_THEMES: ReadonlyMap<string, TargetTheme> = new Map<string, TargetTheme>([
  ["arcade", ARCADE_THEME],
  ["microbit", { tokens: {} }],
]);

/** A declared target as the editor presents it. */
export interface ResolvedTarget {
  /** The target id exactly as declared. */
  readonly id: string;
  /** The record's token overrides; empty for a target the record does not know. */
  readonly tokens: ThemeTokenOverrides;
  /** The record's tile fills; `undefined` for a target the record gives none, or does not know. */
  readonly tileColors: TileKindColors | undefined;
}

/**
 * Resolves the target the MakeCode side declared against `themes` (defaults
 * to {@link TARGET_THEMES}). Returns `undefined` when no target is declared:
 * for `undefined`, the empty string, and any value that is not a string. An
 * id `themes` does not know resolves with no overrides and no tile fills.
 */
export function resolveTarget(
  declared: unknown,
  themes: ReadonlyMap<string, TargetTheme> = TARGET_THEMES
): ResolvedTarget | undefined {
  if (typeof declared !== "string" || declared === "") return undefined;
  const theme = themes.get(declared);
  return {
    id: declared,
    tokens: theme?.tokens ?? {},
    tileColors: theme?.tileColors,
  };
}

/** An element whose inline style carries the applied theme. Any `HTMLElement` satisfies it. */
export interface ThemeSurface {
  readonly style: {
    setProperty(property: string, value: string): void;
    removeProperty(property: string): string;
  };
}

/**
 * Makes `surface`'s inline style carry exactly `tokens`: each override is set
 * as a custom property, and every other token of {@link THEME_TOKENS} is
 * removed, so it falls back to the default theme the stylesheets declare.
 */
export function applyTargetTheme(surface: ThemeSurface, tokens: ThemeTokenOverrides): void {
  for (const token of THEME_TOKENS) {
    const value = tokens[token];
    if (value === undefined) {
      surface.style.removeProperty(token);
    } else {
      surface.style.setProperty(token, value);
    }
  }
}

/** The part of the editor session store {@link bindTargetTheme} follows. */
export interface DeclaredTargetSource {
  subscribe(listener: () => void): () => void;
  getSnapshot(): { readonly target: string | undefined };
}

/**
 * Keeps `surface` themed for the target `source` reports as declared: applies
 * that target's overrides from `themes` (defaults to {@link TARGET_THEMES})
 * at once, and again each time the declared target changes, returning to the
 * default theme while none is declared or the id is unknown. Bind the
 * document root so every element inherits the overrides. Returns a function
 * that stops following `source`, leaving the surface as it stands.
 */
export function bindTargetTheme(
  source: DeclaredTargetSource,
  surface: ThemeSurface,
  themes: ReadonlyMap<string, TargetTheme> = TARGET_THEMES
): () => void {
  let applied: { target: string | undefined } | undefined;
  const follow = (): void => {
    const { target } = source.getSnapshot();
    if (applied !== undefined && applied.target === target) return;
    applied = { target };
    applyTargetTheme(surface, resolveTarget(target, themes)?.tokens ?? {});
  };
  follow();
  return source.subscribe(follow);
}
