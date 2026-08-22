import { describe, expect, it } from "vitest";
import {
  detectInstallMode,
  detectInstallState,
  type BeforeInstallPromptEvent,
  type InstallEnvironment,
} from "./platform";

const androidChrome =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
const iphoneSafari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1";
const desktopFirefox =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0";

function environment(
  overrides: Partial<InstallEnvironment>,
): InstallEnvironment {
  return {
    matchMedia: () => ({ matches: false }),
    navigator: { userAgent: desktopFirefox },
    promptEvent: null,
    ...overrides,
  };
}

const promptEvent = {} as BeforeInstallPromptEvent;

describe("detectInstallMode", () => {
  it("reports an installed app when it runs in a standalone window", () => {
    expect(
      detectInstallMode(
        environment({
          matchMedia: (query) => ({ matches: query.includes("standalone") }),
          navigator: { userAgent: androidChrome },
          promptEvent,
        }),
      ),
    ).toBe("installed");
  });

  it("reports an installed app on iOS via navigator.standalone", () => {
    expect(
      detectInstallMode(
        environment({
          navigator: { userAgent: iphoneSafari, standalone: true },
        }),
      ),
    ).toBe("installed");
  });

  it("offers the system dialog when a prompt event was captured", () => {
    expect(
      detectInstallMode(
        environment({ navigator: { userAgent: androidChrome }, promptEvent }),
      ),
    ).toBe("can-prompt");
  });

  it("falls back to manual instructions on iOS, which has no prompt event", () => {
    expect(
      detectInstallMode(environment({ navigator: { userAgent: iphoneSafari } })),
    ).toBe("ios-manual");
  });

  it("stays silent where installation is not available", () => {
    expect(detectInstallMode(environment({}))).toBe("unsupported");
  });

  // Ради этого случая режим и заведён: раньше отсюда возвращалось
  // «unsupported», и человеку с установимым порталом портал молчал.
  it("explains the browser menu on Android when Chrome sent no event", () => {
    expect(
      detectInstallMode(environment({ navigator: { userAgent: androidChrome } })),
    ).toBe("android-manual");
  });

  it("keeps the system dialog ahead of the manual advice when the event is here", () => {
    expect(
      detectInstallMode(
        environment({ navigator: { userAgent: androidChrome }, promptEvent }),
      ),
    ).toBe("can-prompt");
  });

  it("leaves the desktop silent: there the banner is hidden anyway", () => {
    expect(
      detectInstallMode(environment({ navigator: { userAgent: desktopFirefox } })),
    ).toBe("unsupported");
  });
});

const yandexAndroid =
  "Mozilla/5.0 (Linux; arm_64; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 YaBrowser/23.1.2.86.00 SA/3 Mobile Safari/537.36";
const yandexAppAndroid =
  "Mozilla/5.0 (Linux; arm_64; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 YaApp_Android/23.14.1 YaSearchBrowser/23.14.1 BroPP/1.0 SA/3 Mobile Safari/537.36";
const yandexIos =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) YaBrowser/23.9.0.100 Mobile/15E148 Safari/604.1";
const yandexDesktop =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 YaBrowser/23.11.0.0 Safari/537.36";
const androidFirefox =
  "Mozilla/5.0 (Android 14; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0";

describe("detectInstallMode in a browser that cannot install", () => {
  it("refuses the system dialog in Yandex Browser on Android, where it makes a shortcut", () => {
    expect(
      detectInstallMode(
        environment({ navigator: { userAgent: yandexAndroid }, promptEvent }),
      ),
    ).toBe("wrong-browser");
  });

  it("still speaks up in the Yandex app browser, which never sends the event", () => {
    expect(
      detectInstallMode(environment({ navigator: { userAgent: yandexAppAndroid } })),
    ).toBe("wrong-browser");
  });

  it("sends iOS Yandex Browser to Safari instead of the share sheet", () => {
    expect(
      detectInstallMode(environment({ navigator: { userAgent: yandexIos } })),
    ).toBe("wrong-browser");
  });

  it("leaves desktop Yandex Browser alone: there the install opens a real app window", () => {
    expect(
      detectInstallMode(
        environment({ navigator: { userAgent: yandexDesktop }, promptEvent }),
      ),
    ).toBe("can-prompt");
  });

  it("sends Firefox on Android to Chrome: it makes a shortcut, not an app", () => {
    expect(
      detectInstallMode(environment({ navigator: { userAgent: androidFirefox } })),
    ).toBe("wrong-browser");
  });

  it("treats a shortcut opened in minimal-ui as installed, not as a fresh chance to nag", () => {
    expect(
      detectInstallMode(
        environment({
          matchMedia: (query) => ({ matches: query.includes("minimal-ui") }),
          navigator: { userAgent: yandexAndroid },
          promptEvent,
        }),
      ),
    ).toBe("installed");
  });
});

describe("detectInstallState", () => {
  it("reports the browser next to the mode, so the dialog knows what to advise", () => {
    expect(
      detectInstallState(
        environment({ navigator: { userAgent: yandexAndroid }, promptEvent }),
      ),
    ).toEqual({
      mode: "wrong-browser",
      browser: "yandex-browser",
      platform: "android",
    });
  });
});
