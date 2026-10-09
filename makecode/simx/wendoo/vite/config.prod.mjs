import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { editorUiPlugin } from "./editor-ui-plugin.mjs";

/**
 * The entries the prod build emits, one Rollup pass each, keyed by the name
 * `WENDOO_PROD_ENTRY` selects: the editor pass empties `dist` and emits the
 * editor page with the public assets, the simx pass adds the simx page to it.
 */
const entries = {
  editor: { input: "index.html", emptyOutDir: true },
  simx: { input: "simx/index.html", emptyOutDir: false },
};

const name = process.env.WENDOO_PROD_ENTRY;
const entry = entries[name];
if (entry === undefined) {
  throw new Error(`WENDOO_PROD_ENTRY must name one of: ${Object.keys(entries).join(", ")}`);
}
const isEditor = name === "editor";

export default defineConfig({
  base: "./",
  plugins: isEditor ? [react(), editorUiPlugin()] : [],
  publicDir: isEditor ? "public" : false,
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "./src/editor"),
      "@wendoo/ui": path.resolve(process.cwd(), "../../../external/wendoo-lang/packages/ui/src"),
      "@wendoo/docs": path.resolve(process.cwd(), "../../../external/wendoo-lang/packages/docs/src"),
    },
  },
  logLevel: "warning",
  build: {
    outDir: "dist",
    emptyOutDir: entry.emptyOutDir,
    rollupOptions: {
      input: { [name]: entry.input },
    },
  },
});
