const CACHE_PREFIX = "vedamatch-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
// Кэши старого воркера Vedabase: удаляем при активации.
const LEGACY_CACHE_PREFIX = "vedamatch-vedabase-";
const PORTAL_SHELL = "/offline";
const VEDABASE_SHELL = "/vedabase/offline";
const PRE_CACHE = [
  PORTAL_SHELL,
  VEDABASE_SHELL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRE_CACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) ||
                name.startsWith(LEGACY_CACHE_PREFIX),
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Навигацию всегда ведём в сеть: страницы портала персональные и в кэш не
  // попадают. Без сети отдаём оболочку — для библиотеки свою, она умеет
  // читать книги из IndexedDB.
  if (request.mode === "navigate") {
    const shell = url.pathname.startsWith("/vedabase")
      ? VEDABASE_SHELL
      : PORTAL_SHELL;
    event.respondWith(fetch(request).catch(() => caches.match(shell)));
    return;
  }

  if (!isCacheableAsset(url.pathname)) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});

function isCacheableAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname === PORTAL_SHELL ||
    pathname === VEDABASE_SHELL ||
    pathname === "/manifest.webmanifest"
  );
}
