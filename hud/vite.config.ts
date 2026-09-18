import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jarvisSelfEdit } from "./self-edit-plugin.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [jarvisSelfEdit()],
  server: {
    port: 8787,
    strictPort: true,
    // Jarvis rewrites this file himself and re-applies it live. Without this,
    // every self-edit would trip the watcher and restart the boot cinematic.
    watch: { ignored: ["**/jarvis.settings.json"] },
  },
  preview: {
    port: 8787,
    strictPort: true,
  },
});
