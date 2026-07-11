import { defineConfig, devices } from "@playwright/test";
import { authStatePath } from "./e2e/auth-state";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  globalSetup: "./e2e/auth-state.ts",
  use: {
    baseURL,
    storageState: authStatePath,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
