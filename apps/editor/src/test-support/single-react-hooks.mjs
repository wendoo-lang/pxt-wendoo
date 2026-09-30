/**
 * Node module-resolution hooks for the editor's specs: resolves every
 * `react` and `react-dom` specifier, and their subpaths, from the editor's own
 * package, whichever module imports it. Register with `single-react.ts`.
 */

/** URL of the editor's package manifest, the base the React specifiers resolve against. */
const editorPackage = new URL("../../package.json", import.meta.url).href;

/** Matches `react`, `react-dom`, and their subpath specifiers. */
const reactSpecifier = /^react(-dom)?(\/|$)/;

/**
 * Resolves a React specifier as the editor's package would, and every other
 * specifier unchanged.
 *
 * @param {string} specifier - The specifier being resolved.
 * @param {{ parentURL?: string }} context - The resolution context.
 * @param {(specifier: string, context: object) => Promise<object>} nextResolve - The next resolver in the chain.
 */
export async function resolve(specifier, context, nextResolve) {
  if (reactSpecifier.test(specifier)) {
    return nextResolve(specifier, { ...context, parentURL: editorPackage });
  }
  return nextResolve(specifier, context);
}
