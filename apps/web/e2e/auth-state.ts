import type { FullConfig } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const authStatePath = path.resolve(__dirname, ".auth/user.json");

export default async function createAuthState(config: FullConfig): Promise<void> {
  const accessToken = requiredEnvironmentVariable("TEST_ACCESS_TOKEN");
  const userId = requiredEnvironmentVariable("TEST_USER_ID");
  const configuredBaseURL = config.projects[0]?.use.baseURL;
  const baseURL =
    typeof configuredBaseURL === "string"
      ? configuredBaseURL
      : process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const portalURL = new URL(baseURL);

  await mkdir(path.dirname(authStatePath), { recursive: true });
  await writeFile(
    authStatePath,
    JSON.stringify({
      cookies: [
        {
          name: "access_token",
          value: accessToken,
          domain: portalURL.hostname,
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: portalURL.protocol === "https:",
          sameSite: "Lax",
        },
      ],
      origins: [
        {
          origin: portalURL.origin,
          localStorage: [{ name: "vedabase:activeUserId", value: userId }],
        },
      ],
    }),
    "utf8",
  );
}

function requiredEnvironmentVariable(name: "TEST_ACCESS_TOKEN" | "TEST_USER_ID"): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  throw new Error(
    `${name} is required for Playwright execution. ` +
      "Use `playwright test --list` for credential-free discovery; browser acceptance never skips when credentials are absent.",
  );
}
