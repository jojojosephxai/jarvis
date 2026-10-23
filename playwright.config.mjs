import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/setup.mjs",
  timeout: 60000,
  workers: 1,
  expect: { timeout: 20000 },
  use: {
    baseURL: "http://127.0.0.1:4732",
    viewport: { width: 1440, height: 900 },
    timezoneId: "America/New_York",
  },
  webServer: {
    command: "node node_modules/next/dist/bin/next start -p 4732 -H 127.0.0.1",
    env: { JARVIS_VOICE_LAYER: "realtime", XAI_API_KEY: "", AZURE_SPEECH_KEY: "", AZURE_SPEECH_REGION: "", OBSIDIAN_VAULT_PATH: "work/e2e-vault" },
    url: "http://127.0.0.1:4732",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
