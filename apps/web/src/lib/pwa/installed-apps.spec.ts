import { describe, expect, it, vi } from "vitest";
import { hasInstalledWebApp } from "./installed-apps";

describe("hasInstalledWebApp", () => {
  it("recognises the portal installed as a web app", async () => {
    await expect(
      hasInstalledWebApp({
        getInstalledRelatedApps: async () => [
          { platform: "webapp", url: "https://vedamatch.ru/manifest.webmanifest" },
        ],
      }),
    ).resolves.toBe(true);
  });

  it("ignores native applications from the store", async () => {
    await expect(
      hasInstalledWebApp({
        getInstalledRelatedApps: async () => [
          { platform: "play", id: "ru.vedamatch.app" },
        ],
      }),
    ).resolves.toBe(false);
  });

  it("reports nothing installed when the list is empty", async () => {
    await expect(
      hasInstalledWebApp({ getInstalledRelatedApps: async () => [] }),
    ).resolves.toBe(false);
  });

  it("survives browsers without the method, such as Safari and Firefox", async () => {
    await expect(hasInstalledWebApp({})).resolves.toBe(false);
  });

  it("survives a method that throws outside a secure context", async () => {
    const getInstalledRelatedApps = vi.fn(() =>
      Promise.reject(new Error("not allowed")),
    );

    await expect(hasInstalledWebApp({ getInstalledRelatedApps })).resolves.toBe(
      false,
    );
    expect(getInstalledRelatedApps).toHaveBeenCalledOnce();
  });
});
