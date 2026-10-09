import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  logLevel: "warning",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
