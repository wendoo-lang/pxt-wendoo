import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  logLevel: "warning",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      // Bundle only the modules the simulator extension's code reaches: a
      // module none of whose exports are used is left out, even when it runs
      // code on import.
      treeshake: { moduleSideEffects: false },
    },
  },
});
