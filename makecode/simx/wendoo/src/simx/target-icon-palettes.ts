/**
 * Arcade's own palette, each color as `#rrggbb`, index 0 first: the sixteen
 * colors of the `palette` in pxt-arcade's `libs/device/pxt.json`, copied
 * verbatim.
 */
const ARCADE_PALETTE: readonly string[] = [
  "#000000",
  "#ffffff",
  "#ff2121",
  "#ff93c4",
  "#ff8135",
  "#fff609",
  "#249ca3",
  "#78dc52",
  "#003fad",
  "#87f2ff",
  "#8e2ec4",
  "#a4839f",
  "#5c406c",
  "#e5cdc4",
  "#91463d",
  "#000000",
];

/** The palette catalog icons are rendered under for each hosting target, keyed by MakeCode target id. */
const TARGET_ICON_PALETTES: ReadonlyMap<string, readonly string[]> = new Map([["arcade", ARCADE_PALETTE]]);

/**
 * The palette catalog icons are rendered under when the simulator extension
 * is hosted by the MakeCode target `target`, each color as `#rrggbb`.
 * Returns `undefined` for a target with no icon palette, and while no target
 * is declared.
 *
 * @param target - Id of the hosting MakeCode target, such as `arcade`, as the frame URL's `target` parameter names it.
 */
export function targetIconPalette(target: string | undefined): readonly string[] | undefined {
  return target === undefined ? undefined : TARGET_ICON_PALETTES.get(target);
}
