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

  // В разработке воркер не регистрируем и снимаем уже зарегистрированный.
  //
  // sw.js кэширует /_next/static/** стратегией «нашёл в кэше — отдал, в сеть
  // не пошёл». В сборке это безопасно: имена чанков содержат хэш, новая
  // сборка даёт новые адреса. У dev-сервера адреса чанков стабильные, поэтому
  // в кэше навсегда залипает первая увиденная версия файла — правки перестают
  // доезжать до браузера, а страница ломается гидратацией: сервер отдаёт
  // новую разметку, клиент исполняет старый чанк.
  if (process.env.NODE_ENV === "development") {
    await unregisterAppServiceWorker();
    return null;
  }

  await retireLegacyVedabaseWorker();
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/**
 * Снимает воркер и чистит его кэши. Нужно не только для разработки: у того,
 * кто уже открывал портал, регистрация переживает и перезапуск сервера, и
 * очистку `.next`.
 */
export async function unregisterAppServiceWorker(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  await clearOfflineCaches();
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
