import { describe, expect, it, vi } from "vitest";
import {
  REFRESHED_AT_KEY,
  REFRESH_LOCK_NAME,
  coordinatedRefresh,
} from "./refresh-coordinator";

/** Очередь как у Web Locks: колбэки выполняются строго по одному. */
function fakeLocks() {
  let tail: Promise<unknown> = Promise.resolve();
  const names: string[] = [];
  return {
    names,
    request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      names.push(name);
      const run = tail.then(callback);
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  };
}

describe("coordinatedRefresh", () => {
  it("без Web Locks просто обновляет", async () => {
    const refresh = vi.fn().mockResolvedValue(true);
    await expect(coordinatedRefresh(refresh, { locks: null })).resolves.toBe(
      true,
    );
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("две вкладки в очереди: вторая не ходит на сервер, если первая уже обновилась", async () => {
    const locks = fakeLocks();
    const storage = memoryStorage();
    let clock = 1_000;
    const now = () => clock;
    const refresh = vi.fn(async () => {
      clock += 50;
      return true;
    });

    const [first, second] = await Promise.all([
      coordinatedRefresh(refresh, { locks, storage, now }),
      coordinatedRefresh(refresh, { locks, storage, now }),
    ]);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
    expect(locks.names).toEqual([REFRESH_LOCK_NAME, REFRESH_LOCK_NAME]);
    expect(storage.map.get(REFRESHED_AT_KEY)).toBe("1050");
  });

  it("старая отметка соседей не мешает обновиться", async () => {
    const storage = memoryStorage();
    storage.setItem(REFRESHED_AT_KEY, "500");
    const refresh = vi.fn().mockResolvedValue(true);
    await coordinatedRefresh(refresh, {
      locks: fakeLocks(),
      storage,
      now: () => 1_000,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("неудачный refresh не оставляет отметку — следующая вкладка пробует сама", async () => {
    const locks = fakeLocks();
    const storage = memoryStorage();
    const refresh = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const results = await Promise.all([
      coordinatedRefresh(refresh, { locks, storage, now: () => 1_000 }),
      coordinatedRefresh(refresh, { locks, storage, now: () => 1_000 }),
    ]);

    expect(results).toEqual([false, true]);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("сломанное хранилище не ломает обновление", async () => {
    const storage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    const refresh = vi.fn().mockResolvedValue(true);
    await expect(
      coordinatedRefresh(refresh, { locks: fakeLocks(), storage }),
    ).resolves.toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
  });
});
