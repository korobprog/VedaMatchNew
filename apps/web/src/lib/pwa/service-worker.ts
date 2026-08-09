// Ключ хранит id пользователя для офлайн-читалки. Значение менять нельзя:
// его же пишет e2e-подготовка и читает components/vedabase/offline-router.tsx.
export const activeUserKey = "vedabase:activeUserId";

const legacyScope = "/vedabase/";
const cacheNamePrefix = "vedamatch-";

export async function registerAppServiceWorker(
  userId?: string,
): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  if (userId) localStorage.setItem(activeUserKey, userId);
  await retireLegacyVedabaseWorker();
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

// Воркер со scope "/" не получит контроль над /vedabase/*, пока жива старая
// регистрация: при совпадении выигрывает более узкий scope.
export async function retireLegacyVedabaseWorker(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  const registration = await navigator.serviceWorker.getRegistration(legacyScope);
  if (!registration?.scope.endsWith(legacyScope)) return;
  await registration.unregister();
}

export async function clearOfflineCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(cacheNamePrefix))
      .map((name) => caches.delete(name)),
  );
}
