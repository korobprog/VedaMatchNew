import { describe, expect, it } from "vitest";
import type { InstallEnvironmentSummary } from "@vedamatch/shared";
import {
  buildInstallEnvironmentTable,
  formatShare,
} from "./install-environment-view";

const summary: InstallEnvironmentSummary = {
  total: 200,
  installed: 60,
  deadEnd: 90,
  rows: [
    {
      browser: "chrome",
      platform: "android",
      displayMode: "browser",
      standaloneCapable: true,
      users: 70,
    },
    {
      browser: "chrome",
      platform: "android",
      displayMode: "standalone",
      standaloneCapable: true,
      users: 40,
    },
    {
      browser: "yandex-browser",
      platform: "android",
      displayMode: "browser",
      standaloneCapable: false,
      users: 70,
    },
    {
      browser: "yandex-browser",
      platform: "desktop",
      displayMode: "standalone",
      standaloneCapable: true,
      users: 20,
    },
  ],
};

describe("buildInstallEnvironmentTable", () => {
  it("складывает строки одного браузера и считает долю", () => {
    const table = buildInstallEnvironmentTable(summary);

    expect(table).toEqual([
      {
        browser: "chrome",
        users: 110,
        share: 55,
        installed: 40,
        standaloneCapable: true,
      },
      {
        browser: "yandex-browser",
        users: 90,
        share: 45,
        installed: 20,
        standaloneCapable: false,
      },
    ]);
  });

  it("считает браузер тупиковым, если он тупиковый хотя бы на одной платформе", () => {
    // Десктопный Яндекс.Браузер ставит нормально, мобильный — нет; строка
    // в таблице одна, и она должна показывать проблему, а не прятать её.
    const [, yandex] = buildInstallEnvironmentTable(summary);
    expect(yandex.standaloneCapable).toBe(false);
  });

  it("переживает пустой замер, не деля на ноль", () => {
    expect(
      buildInstallEnvironmentTable({
        total: 0,
        installed: 0,
        deadEnd: 0,
        rows: [],
      }),
    ).toEqual([]);
    expect(formatShare(5, 0)).toBe(0);
  });
});
