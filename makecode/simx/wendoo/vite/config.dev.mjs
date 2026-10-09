import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { editorUiPlugin } from "./editor-ui-plugin.mjs";

export default defineConfig({
  base: "/",
  appType: "spa",
  plugins: [react(), editorUiPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "./src/editor"),
      "@wendoo/ui": path.resolve(process.cwd(), "../../../external/wendoo-lang/packages/ui/src"),
      "@wendoo/docs": path.resolve(process.cwd(), "../../../external/wendoo-lang/packages/docs/src"),
    },
  },
  server: {
    port: 5175,
    strictPort: true,
    fs: {
      allow: [path.resolve(process.cwd(), "../../..")],
    },
  },
});
