import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [path.resolve(process.cwd(), "../../..")],
    },
  },
});
