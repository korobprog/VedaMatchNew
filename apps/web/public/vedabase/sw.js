const CACHE_PREFIX = "vedamatch-vedabase-";
const CACHE_NAME = `${CACHE_PREFIX}shell-v1`;
const OFFLINE_SHELL = "/vedabase/offline";
const PRE_CACHE = [OFFLINE_SHELL, "/vedabase.webmanifest", "/logo_tilak.png"];

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
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
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

  if (request.mode === "navigate" && url.pathname.startsWith("/vedabase")) {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_SHELL)));
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

self.addEventListener("message", (event) => {
  if (event.data !== "CLEAR_VEDABASE_CACHE") return;
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name)),
        ),
      ),
  );
});

function isCacheableAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname === OFFLINE_SHELL ||
    pathname === "/vedabase.webmanifest" ||
    pathname === "/logo_tilak.png"
  );
}
