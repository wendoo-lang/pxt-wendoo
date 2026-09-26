import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { uiPlugin } from "../../../external/wendoo-lang/packages/ui/src/vite-plugin.ts";

export default defineConfig({
  base: "/",
  appType: "spa",
  plugins: [react(), uiPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "./src"),
      "@wendoo/ui": path.resolve(process.cwd(), "../../external/wendoo-lang/packages/ui/src"),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(process.cwd(), "../..")],
    },
  },
});
