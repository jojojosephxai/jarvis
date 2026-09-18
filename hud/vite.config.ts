import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 8787,
    strictPort: true,
    proxy: {
      // Local Node path: Vite → bridge on 8790
      "/api/chat": {
        target: "http://127.0.0.1:8790",
        changeOrigin: true,
      },
      "/api/health": {
        target: "http://127.0.0.1:8790",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/health/, "/health"),
      },
    },
  },
  preview: {
    port: 8787,
    strictPort: true,
  },
});
