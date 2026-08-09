import { describe, expect, it } from "vitest";
import {
  isInstallBannerDismissed,
  rememberInstallDismissal,
} from "./install-dismissal";

describe("install banner dismissal", () => {
  it("shows the banner when nothing was stored", () => {
    expect(isInstallBannerDismissed({ getItem: () => null })).toBe(false);
  });

  it("stays hidden once the user closed it", () => {
    const store = new Map<string, string>();
    rememberInstallDismissal({
      setItem: (key, value) => void store.set(key, value),
    });

    expect(
      isInstallBannerDismissed({ getItem: (key) => store.get(key) ?? null }),
    ).toBe(true);
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
