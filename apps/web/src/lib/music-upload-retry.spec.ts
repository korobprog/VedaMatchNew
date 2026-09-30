import { describe, expect, it, vi } from "vitest";
import {
  UploadNetworkError,
  backoffDelay,
  isRetryableUploadError,
  keepScreenAwake,
  presignExpired,
  waitUntilVisibleAndOnline,
} from "./music-upload-retry";

function fakeEnv(visibility: "visible" | "hidden", onLine: boolean) {
  const listeners = new Map<string, Set<() => void>>();
  const target = () => ({
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners.get(type)?.delete(fn);
    },
  });
  const doc = { visibilityState: visibility, ...target() };
  const nav = { onLine };
  const win = target();
  const fire = (type: string) => listeners.get(type)?.forEach((fn) => fn());
  return { doc, nav, win, fire, listeners };
}

describe("политика повторов заливки", () => {
  it("повторяет только обрыв сети, а не отказ хранилища", () => {
    expect(isRetryableUploadError(new UploadNetworkError())).toBe(true);
    expect(isRetryableUploadError(new Error("Хранилище отказало (403)"))).toBe(
      false,
    );
    expect(isRetryableUploadError("boom")).toBe(false);
  });

  it("паузы 1 с и 3 с, после третьей попытки — стоп", () => {
    expect(backoffDelay(1)).toBe(1000);
    expect(backoffDelay(2)).toBe(3000);
    expect(backoffDelay(3)).toBeNull();
  });

  it("подпись считается истёкшей с запасом", () => {
    expect(presignExpired(0, 10_000, 900)).toBe(false);
    expect(presignExpired(0, 900_000 - 30_000, 900)).toBe(true);
  });
});

describe("waitUntilVisibleAndOnline", () => {
  it("сразу готово, если страница видна и связь есть", async () => {
    const { doc, nav, win } = fakeEnv("visible", true);
    await expect(
      waitUntilVisibleAndOnline(doc, nav, win),
    ).resolves.toBeUndefined();
  });

  it("ждёт visibilitychange и снимает слушателей", async () => {
    const env = fakeEnv("hidden", true);
    const done = vi.fn();
    void waitUntilVisibleAndOnline(env.doc, env.nav, env.win).then(done);

    env.fire("visibilitychange");
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();

    env.doc.visibilityState = "visible";
    env.fire("visibilitychange");
    await Promise.resolve();
    expect(done).toHaveBeenCalled();
    expect(env.listeners.get("visibilitychange")?.size).toBe(0);
    expect(env.listeners.get("online")?.size).toBe(0);
  });

  it("видна, но офлайн — ждёт события online", async () => {
    const env = fakeEnv("visible", false);
    const done = vi.fn();
    void waitUntilVisibleAndOnline(env.doc, env.nav, env.win).then(done);

    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();

    env.nav.onLine = true;
    env.fire("online");
    await Promise.resolve();
    expect(done).toHaveBeenCalled();
  });
});

describe("keepScreenAwake", () => {
  it("без поддержки — ничего не делает и не падает", () => {
    const { doc } = fakeEnv("visible", true);
    expect(() => keepScreenAwake({}, doc)()).not.toThrow();
  });

  it("берёт блокировку и отпускает её", async () => {
    const { doc } = fakeEnv("visible", true);
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release });
    const stop = keepScreenAwake({ wakeLock: { request } }, doc);
    await Promise.resolve();
    await Promise.resolve();
    expect(request).toHaveBeenCalledWith("screen");
    stop();
    expect(release).toHaveBeenCalled();
  });

  it("отказ браузера глушится", async () => {
    const { doc } = fakeEnv("visible", true);
    const request = vi.fn().mockRejectedValue(new Error("denied"));
    const stop = keepScreenAwake({ wakeLock: { request } }, doc);
    await Promise.resolve();
    expect(() => stop()).not.toThrow();
  });
});
