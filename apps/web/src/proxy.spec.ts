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

  it("lets guests reach support, team, legal, updates and service description pages", () => {
    for (const path of [
      "/support",
      "/support/track/abc",
      "/team",
      "/legal/privacy",
      "/updates",
      "/updates/history",
      "/services/union",
      "/services/astro",
      "/vaishnava",
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

  describe("vaishnava subdomain", () => {
    const request = (path: string, headers: Record<string, string> = {}) =>
      new NextRequest(`https://vaishnava.vedamatch.ru${path}`, {
        headers: { host: "vaishnava.vedamatch.ru", ...headers },
      });

    it("serves the landing at the root without changing the address", () => {
      const response = proxy(request("/?ref=ABC1234"));

      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-rewrite")).toBe(
        "https://vaishnava.vedamatch.ru/vaishnava?ref=ABC1234",
      );
      // Реферальный код запоминается и на поддомене: ссылку с ним шлют
      // именно преданным.
      expect(response.cookies.get("vm_ref")?.value).toBe("ABC1234");
    });

    it("collapses the duplicate /vaishnava path into the root", () => {
      const response = proxy(request("/vaishnava"));

      expect(response.headers.get("location")).toBe(
        "https://vaishnava.vedamatch.ru/",
      );
    });

    it("sends every other path to the main domain with the same path", () => {
      for (const path of ["/login", "/services/union?x=1", "/union", "/support"]) {
        const response = proxy(request(path));

        expect(response.headers.get("location"), path).toBe(
          `https://vedamatch.ru${path}`,
        );
      }
    });

    it("keeps the host port and honours the forwarded scheme", () => {
      const response = proxy(
        new NextRequest("http://vaishnava.localhost:3000/login", {
          headers: {
            host: "vaishnava.localhost:3000",
            "x-forwarded-proto": "https",
          },
        }),
      );

      expect(response.headers.get("location")).toBe(
        "https://localhost:3000/login",
      );
    });

    it("drops the internal port when the public host has none", () => {
      // За Traefik Next видит запрос как http://web:3000/login, а браузер —
      // https://vaishnava.vedamatch.ru/login. Порт 3000 наружу уходить не должен.
      const response = proxy(
        new NextRequest("http://web:3000/login", {
          headers: {
            host: "vaishnava.vedamatch.ru",
            "x-forwarded-proto": "https",
          },
        }),
      );

      expect(response.headers.get("location")).toBe(
        "https://vedamatch.ru/login",
      );
    });

    it("leaves the main domain alone", () => {
      const response = proxy(
        new NextRequest("https://vedamatch.ru/vaishnava", {
          headers: { host: "vedamatch.ru" },
        }),
      );

      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    });
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

  describe("реферальная cookie", () => {
    it("запоминает код из ?ref= на лендинге", () => {
      const response = proxy(
        new NextRequest("https://vedamatch.ru/?ref=ACDEFGH"),
      );

      expect(response.cookies.get("vm_ref")?.value).toBe("ACDEFGH");
    });

    it("приводит код к верхнему регистру", () => {
      const response = proxy(
        new NextRequest("https://vedamatch.ru/?ref=acdefgh"),
      );

      expect(response.cookies.get("vm_ref")?.value).toBe("ACDEFGH");
    });

    // Первый код выигрывает: иначе приглашённый достаётся тому, кто последним
    // прислал ссылку.
    it("не перезаписывает уже сохранённый код", () => {
      const response = proxy(
        new NextRequest("https://vedamatch.ru/?ref=QRTUVWX", {
          headers: { cookie: "vm_ref=ACDEFGH" },
        }),
      );

      expect(response.cookies.get("vm_ref")).toBeUndefined();
    });

    it("не записывает мусор из адресной строки", () => {
      const response = proxy(
        new NextRequest("https://vedamatch.ru/?ref=<script>"),
      );

      expect(response.cookies.get("vm_ref")).toBeUndefined();
    });

    it("заводит отпечаток устройства один раз", () => {
      const fresh = proxy(new NextRequest("https://vedamatch.ru/"));
      expect(fresh.cookies.get("vm_fp")?.value).toBeTruthy();

      const repeat = proxy(
        new NextRequest("https://vedamatch.ru/", {
          headers: { cookie: "vm_fp=already-here" },
        }),
      );
      expect(repeat.cookies.get("vm_fp")).toBeUndefined();
    });
  });
});
