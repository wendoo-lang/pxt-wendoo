/**
 * The editor's themeable token set: every CSS custom property a target theme
 * may override. It holds the semantic color contract `@wendoo/ui` declares in
 * `ui.css` -- the tokens the editor's own UI and the shared components paint
 * with -- and the brain editor's `--color-brain-*` tokens. A target theme
 * may override any of them.
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
  "--color-brain-rule-from",
  "--color-brain-rule-to",
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

/** Values that replace the default theme's, keyed by token; a token left out keeps its default. Values are CSS colors. */
export type ThemeTokenOverrides = Readonly<Partial<Record<ThemeToken, string>>>;

/** What the editor knows about one MakeCode target: how it names the target, and how it themes for it. */
export interface TargetTheme {
  /** The target's name as the app header shows it, for example `micro:bit`. */
  readonly displayName: string;
  /** The token overrides applied while this target is declared; empty for the default theme. */
  readonly tokens: ThemeTokenOverrides;
}

/**
 * The per-target record: each known MakeCode target's {@link TargetTheme},
 * keyed by the target id the MakeCode side declares in the session. Add an
 * entry here to support a new target.
 */
export const TARGET_THEMES: ReadonlyMap<string, TargetTheme> = new Map<string, TargetTheme>([
  ["arcade", { displayName: "Arcade", tokens: {} }],
  ["microbit", { displayName: "micro:bit", tokens: {} }],
]);

/** A declared target as the editor presents it. */
export interface ResolvedTarget {
  /** The target id exactly as declared. */
  readonly id: string;
  /** The record's display name, or the raw id for a target the record does not know. */
  readonly displayName: string;
  /** The record's token overrides; empty for a target the record does not know. */
  readonly tokens: ThemeTokenOverrides;
}

/**
 * Resolves the target the MakeCode side declared against `themes` (defaults
 * to {@link TARGET_THEMES}). Returns `undefined` when no target is declared:
 * for `undefined`, the empty string, and any value that is not a string. An
 * id `themes` does not know resolves to itself as the display name, with no
 * overrides.
 */
export function resolveTarget(
  declared: unknown,
  themes: ReadonlyMap<string, TargetTheme> = TARGET_THEMES
): ResolvedTarget | undefined {
  if (typeof declared !== "string" || declared === "") return undefined;
  const theme = themes.get(declared);
  return { id: declared, displayName: theme?.displayName ?? declared, tokens: theme?.tokens ?? {} };
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
