import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60000,
  workers: 1,
  expect: { timeout: 20000 },
  use: {
    baseURL: "http://127.0.0.1:4721",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "JARVIS_VOICE_LAYER=realtime npm run start",
    env: { XAI_API_KEY: "" },
    url: "http://127.0.0.1:4721",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
