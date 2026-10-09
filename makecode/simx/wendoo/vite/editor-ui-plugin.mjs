import path from "path";
import { uiPlugin } from "../../../../external/wendoo-lang/packages/ui/src/vite-plugin.ts";

/**
 * The ui package's Vite plugin with its html transform applied to the editor
 * entry alone, the project's root `index.html`: the simx entry's page takes
 * no font preload.
 */
export function editorUiPlugin() {
  const plugin = uiPlugin();
  let editorEntry;
  return {
    ...plugin,
    configResolved(config) {
      editorEntry = path.resolve(config.root, "index.html");
      plugin.configResolved(config);
    },
    transformIndexHtml(html, ctx) {
      return path.resolve(ctx.filename) === editorEntry ? plugin.transformIndexHtml(html, ctx) : undefined;
    },
  };
}
