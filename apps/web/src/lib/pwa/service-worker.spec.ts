import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activeUserKey,
  clearOfflineCaches,
  registerAppServiceWorker,
  retireLegacyVedabaseWorker,
} from "./service-worker";

function stubCaches(names: string[]) {
  const deleted: string[] = [];
  vi.stubGlobal("caches", {
    keys: vi.fn().mockResolvedValue(names),
    delete: vi.fn(async (name: string) => {
      deleted.push(name);
      return true;
    }),
  });
  return deleted;
}

describe("service worker registration", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("keeps the storage key the offline reader and e2e setup rely on", () => {
    expect(activeUserKey).toBe("vedabase:activeUserId");
  });

  it("retires the old vedabase worker before registering the root one", async () => {
    const order: string[] = [];
    const unregister = vi.fn(async () => {
      order.push("unregister");
      return true;
    });
    const register = vi.fn(async () => {
      order.push("register");
      return {} as ServiceWorkerRegistration;
    });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn(async () => ({
          scope: "https://vedamatch.ru/vedabase/",
          unregister,
        })),
        register,
      },
    });

    await registerAppServiceWorker("user-1");

    expect(order).toEqual(["unregister", "register"]);
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    expect(localStorage.getItem(activeUserKey)).toBe("user-1");
  });

  it("does not unregister the root worker when the old one is already gone", async () => {
    const unregister = vi.fn();
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn(async () => ({
          scope: "https://vedamatch.ru/",
          unregister,
        })),
        register: vi.fn(),
      },
    });

    await retireLegacyVedabaseWorker();

    expect(unregister).not.toHaveBeenCalled();
  });

  it("clears both current and legacy caches, leaving unrelated ones alone", async () => {
    const deleted = stubCaches([
      "vedamatch-shell-v1",
      "vedamatch-vedabase-shell-v1",
      "some-other-cache",
    ]);

    await clearOfflineCaches();

    expect(deleted).toEqual([
      "vedamatch-shell-v1",
      "vedamatch-vedabase-shell-v1",
    ]);
  });
});
