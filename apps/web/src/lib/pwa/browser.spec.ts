import { describe, expect, it } from "vitest";
import {
  detectBrowserFamily,
  detectDisplayMode,
  detectPlatform,
  installsAsStandaloneApp,
} from "./browser";

const agents = {
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  yandexAndroid:
    "Mozilla/5.0 (Linux; arm_64; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 YaBrowser/23.1.2.86.00 SA/3 Mobile Safari/537.36",
  yandexAppAndroid:
    "Mozilla/5.0 (Linux; arm_64; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 YaApp_Android/23.14.1 YaSearchBrowser/23.14.1 BroPP/1.0 SA/3 Mobile Safari/537.36",
  samsungAndroid:
    "Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/21.0 Chrome/110.0.0.0 Mobile Safari/537.36",
  edgeAndroid:
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 EdgA/120.0.0.0",
  operaAndroid:
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 OPR/79.0.0.0",
  firefoxAndroid:
    "Mozilla/5.0 (Android 14; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1",
  yandexIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) YaBrowser/23.9.0.100 Mobile/15E148 Safari/604.1",
  chromeDesktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  yandexDesktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 YaBrowser/23.11.0.0 Safari/537.36",
};

describe("detectBrowserFamily", () => {
  // Каждый из них представляется Chrome'ом, поэтому проверка «Chrome/ в UA»
  // сложила бы их все в одну корзину.
  it.each([
    ["chrome", agents.chromeAndroid],
    ["yandex-browser", agents.yandexAndroid],
    ["yandex-app", agents.yandexAppAndroid],
    ["samsung", agents.samsungAndroid],
    ["edge", agents.edgeAndroid],
    ["opera", agents.operaAndroid],
    ["firefox", agents.firefoxAndroid],
    ["safari", agents.safariIos],
    ["chrome", agents.chromeIos],
    ["yandex-browser", agents.yandexIos],
  ])("reads %s out of a look-alike user agent", (expected, userAgent) => {
    expect(detectBrowserFamily(userAgent)).toBe(expected);
  });

  it("gives up on an unknown agent instead of guessing Chrome", () => {
    expect(detectBrowserFamily("SomeCrawler/1.0")).toBe("other");
  });
});

describe("detectPlatform", () => {
  it.each([
    ["android", agents.yandexAndroid],
    ["ios", agents.safariIos],
    ["desktop", agents.chromeDesktop],
  ])("reports %s", (expected, userAgent) => {
    expect(detectPlatform(userAgent)).toBe(expected);
  });
});

describe("installsAsStandaloneApp", () => {
  it("allows only WebAPK minters on Android", () => {
    expect(installsAsStandaloneApp("chrome", "android")).toBe(true);
    expect(installsAsStandaloneApp("samsung", "android")).toBe(true);
    // Ярлык внутри браузера — с адресной строкой и нижней панелью.
    expect(installsAsStandaloneApp("yandex-browser", "android")).toBe(false);
    expect(installsAsStandaloneApp("yandex-app", "android")).toBe(false);
    expect(installsAsStandaloneApp("firefox", "android")).toBe(false);
    expect(installsAsStandaloneApp("edge", "android")).toBe(false);
  });

  it("allows only Safari on iOS", () => {
    expect(installsAsStandaloneApp("safari", "ios")).toBe(true);
    expect(installsAsStandaloneApp("chrome", "ios")).toBe(false);
    expect(installsAsStandaloneApp("yandex-browser", "ios")).toBe(false);
  });

  it("does not care about the vendor on desktop, where any Chromium opens an app window", () => {
    expect(installsAsStandaloneApp("yandex-browser", "desktop")).toBe(true);
    expect(installsAsStandaloneApp("chrome", "desktop")).toBe(true);
    expect(installsAsStandaloneApp("other", "desktop")).toBe(false);
  });
});

describe("detectDisplayMode", () => {
  const matching = (mode: string) => (query: string) => ({
    matches: query.includes(mode),
  });

  it.each(["fullscreen", "standalone", "minimal-ui"])(
    "reads %s from the media query",
    (mode) => {
      expect(detectDisplayMode(matching(mode))).toBe(mode);
    },
  );

  it("falls back to browser when nothing matches", () => {
    expect(detectDisplayMode(() => ({ matches: false }))).toBe("browser");
  });

  it("trusts navigator.standalone on iOS, which may not answer the media query", () => {
    expect(detectDisplayMode(() => ({ matches: false }), true)).toBe(
      "standalone",
    );
  });

  it("prefers fullscreen over standalone when both match", () => {
    expect(detectDisplayMode(() => ({ matches: true }))).toBe("fullscreen");
  });
});
