import { readdirSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

/** Расширения, которые matcher в proxy.ts исключает — гард их не видит. */
const BYPASSED = /\.(?:svg|png|jpg|ico)$/;

describe("proxy", () => {
  it("allows guests to open the landing page", () => {
    const response = proxy(new NextRequest("https://vedamatch.ru/"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects guests from protected pages and preserves the destination", () => {
    const response = proxy(
      new NextRequest("https://vedamatch.ru/union?tab=matches"),
    );

    expect(response.headers.get("location")).toBe(
      "https://vedamatch.ru/?returnTo=%2Funion%3Ftab%3Dmatches",
    );
  });

  it("lets guests reach support, legal, updates and service description pages", () => {
    for (const path of [
      "/support",
      "/support/track/abc",
      "/legal/privacy",
      "/updates",
      "/updates/history",
      "/services/union",
      "/services/astro",
    ]) {
      const response = proxy(new NextRequest(`https://vedamatch.ru${path}`));

      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("serves the worker, manifest and offline shells to guests", () => {
    for (const path of [
      "/sw.js",
      "/manifest.webmanifest",
      "/offline",
      "/vedabase/offline",
    ]) {
      const response = proxy(new NextRequest(`https://vedamatch.ru${path}`));

      expect(response.headers.get("location"), path).toBeNull();
    }
  });

  // Прежняя версия теста перечисляла файлы руками и потому повторяла
  // реализацию: pwa-install-prompt.js не был ни там, ни в publicFiles, и
  // проверка его отсутствие не замечала. Теперь список берётся с диска.
  it("serves every non-image file from public/ to guests", () => {
    // cwd теста — apps/web (корень vitest); import.meta.url здесь не file://.
    const publicDir = join(process.cwd(), "public");
    const files = readdirSync(publicDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !BYPASSED.test(entry.name))
      .map((entry) => `/${entry.name}`);

    expect(files.length).toBeGreaterThan(0);
    for (const path of files) {
      const response = proxy(new NextRequest(`https://vedamatch.ru${path}`));

      expect(response.headers.get("location"), path).toBeNull();
    }
  });

  it("still guards the library itself", () => {
    const response = proxy(new NextRequest("https://vedamatch.ru/vedabase"));

    expect(response.headers.get("location")).toBe(
      "https://vedamatch.ru/?returnTo=%2Fvedabase",
    );
  });

  it("keeps authenticated users away from the login page", () => {
    const response = proxy(
      new NextRequest("https://vedamatch.ru/login", {
        headers: { cookie: "access_token=valid" },
      }),
    );

    expect(response.headers.get("location")).toBe("https://vedamatch.ru/");
  });

  it("lets a user with a session marker but no access token through to protected pages", () => {
    const response = proxy(
      new NextRequest("https://vedamatch.ru/union?tab=matches", {
        headers: { cookie: "vm_session=1" },
      }),
    );

    expect(response.headers.get("location")).toBeNull();
  });

  it("still lets the marker holder open the landing and login pages", () => {
    for (const path of ["/", "/login"]) {
      const response = proxy(
        new NextRequest(`https://vedamatch.ru${path}`, {
          headers: { cookie: "vm_session=1" },
        }),
      );

      expect(response.headers.get("location"), path).toBeNull();
    }
  });
});
