// Один refresh на все вкладки браузера.
//
// Access-cookie живёт 15 минут и общая у всех вкладок, поэтому истекает у
// них одновременно — и каждая шла на /auth/refresh с одной и той же
// refresh-cookie. Дедупликация в http-client работает только внутри вкладки,
// так что вкладки гонялись между собой, а проигравшая уходила на лендинг.
//
// Web Locks выстраивают вкладки в очередь. Дождавшаяся сначала смотрит в
// localStorage: если соседняя обновилась уже после того, как эта встала в
// очередь, cookie свежие и второй запрос не нужен. Без Web Locks (старый
// браузер, тесты) — прежнее поведение, гонку разрулит сервер.

export const REFRESH_LOCK_NAME = "vm-auth-refresh";
export const REFRESHED_AT_KEY = "vm_refreshed_at";

type LockManagerLike = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type RefreshCoordinatorDeps = {
  locks?: LockManagerLike | null;
  storage?: StorageLike | null;
  now?: () => number;
};

function browserDeps(): RefreshCoordinatorDeps {
  if (typeof window === "undefined") return {};
  let storage: StorageLike | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  const locks =
    typeof navigator !== "undefined" && "locks" in navigator
      ? (navigator.locks as LockManagerLike)
      : null;
  return { locks, storage };
}

function readRefreshedAt(storage: StorageLike | null | undefined): number {
  try {
    return Number(storage?.getItem(REFRESHED_AT_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeRefreshedAt(
  storage: StorageLike | null | undefined,
  at: number,
): void {
  try {
    storage?.setItem(REFRESHED_AT_KEY, String(at));
  } catch {
    // Приватный режим или запрет хранилища: соседние вкладки просто
    // обновятся сами.
  }
}

export async function coordinatedRefresh(
  refresh: () => Promise<boolean>,
  deps: RefreshCoordinatorDeps = browserDeps(),
): Promise<boolean> {
  const now = deps.now ?? Date.now;
  const { locks, storage } = deps;
  if (!locks) return refresh();

  const queuedAt = now();
  return locks.request(REFRESH_LOCK_NAME, async () => {
    if (readRefreshedAt(storage) >= queuedAt) return true;
    const ok = await refresh();
    if (ok) writeRefreshedAt(storage, now());
    return ok;
  });
}
