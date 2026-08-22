import { describe, expect, it } from "vitest";
import {
  installDismissalDays,
  isInstallBannerDismissed,
  rememberInstallDismissal,
} from "./install-dismissal";

const day = 24 * 60 * 60 * 1000;
const closedAt = Date.parse("2026-08-01T10:00:00Z");

describe("install banner dismissal", () => {
  it("shows the banner when nothing was stored", () => {
    expect(isInstallBannerDismissed({ getItem: () => null })).toBe(false);
  });

  it("stays hidden once the user closed it", () => {
    const store = new Map<string, string>();
    rememberInstallDismissal(
      { setItem: (key, value) => void store.set(key, value) },
      closedAt,
    );

    expect(
      isInstallBannerDismissed(
        { getItem: (key) => store.get(key) ?? null },
        closedAt + day,
      ),
    ).toBe(true);
  });

  it("comes back when the refusal has run out: a cross is «not now», not «never»", () => {
    const store = new Map<string, string>();
    rememberInstallDismissal(
      { setItem: (key, value) => void store.set(key, value) },
      closedAt,
    );

    expect(
      isInstallBannerDismissed(
        { getItem: (key) => store.get(key) ?? null },
        closedAt + (installDismissalDays + 1) * day,
      ),
    ).toBe(false);
  });

  // Отметку "1" писала прежняя версия, когда отказ был вечным. Согласия на
  // «никогда» человек не давал, поэтому такая запись не считается.
  it("ignores the old endless mark", () => {
    expect(isInstallBannerDismissed({ getItem: () => "1" }, closedAt)).toBe(
      false,
    );
  });

  it("ignores a mark it cannot read", () => {
    expect(
      isInstallBannerDismissed({ getItem: () => "позавчера" }, closedAt),
    ).toBe(false);
  });

  it("survives storage that throws, as in private browsing", () => {
    expect(
      isInstallBannerDismissed({
        getItem: () => {
          throw new Error("denied");
        },
      }),
    ).toBe(false);
  });
});
