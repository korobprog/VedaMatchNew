import { describe, expect, it } from "vitest";
import { buildInstallEnvironmentReport } from "./install-environment";

const yandexAndroid =
  "Mozilla/5.0 (Linux; arm_64; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 YaBrowser/23.1.2.86.00 SA/3 Mobile Safari/537.36";
const chromeAndroid =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

const browserWindow = () => ({ matches: false });

describe("buildInstallEnvironmentReport", () => {
  it("marks a Yandex Browser session as a dead end", () => {
    expect(
      buildInstallEnvironmentReport({
        userAgent: yandexAndroid,
        matchMedia: browserWindow,
      }),
    ).toEqual({
      browser: "yandex-browser",
      platform: "android",
      displayMode: "browser",
      standaloneCapable: false,
    });
  });

  it("catches the case we are hunting: a shortcut that claims to be standalone but was made by Yandex", () => {
    expect(
      buildInstallEnvironmentReport({
        userAgent: yandexAndroid,
        matchMedia: (query) => ({ matches: query.includes("standalone") }),
      }),
    ).toMatchObject({
      browser: "yandex-browser",
      displayMode: "standalone",
      standaloneCapable: false,
    });
  });

  it("reports a healthy Chrome install", () => {
    expect(
      buildInstallEnvironmentReport({
        userAgent: chromeAndroid,
        matchMedia: (query) => ({ matches: query.includes("standalone") }),
      }),
    ).toEqual({
      browser: "chrome",
      platform: "android",
      displayMode: "standalone",
      standaloneCapable: true,
    });
  });
});
