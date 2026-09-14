const CACHE_PREFIX = "vedamatch-shell-";
// v3 — манифест и значки перешли на «сначала сеть» (VED-78). Смена имени
// удаляет при активации кэш v2: в нём у давно установивших лежит манифест
// с быстрым меню из двух пунктов, и сам он оттуда уже никогда бы не ушёл.
const CACHE_NAME = `${CACHE_PREFIX}v3`;
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

  if (isImmutableAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (isRefreshableAsset(url.pathname)) {
    event.respondWith(networkFirst(request));
  }
});

/** Чанки сборки: в имени хэш, под тем же адресом содержимое не меняется. */
function isImmutableAsset(pathname) {
  return pathname.startsWith("/_next/static/");
}

/**
 * Файлы с постоянным адресом, содержимое которых меняется от выката к выкату.
 *
 * Раньше они шли тем же «нашёл в кэше — отдал», что и чанки, и манифест
 * навсегда застревал в первой увиденной версии: быстрое меню значка
 * приложения на телефоне показывало два старых пункта даже после
 * переустановки — данные сайта при ней не стираются (VED-78).
 */
function isRefreshableAsset(pathname) {
  return (
    pathname.startsWith("/icons/") ||
    pathname === PORTAL_SHELL ||
    pathname === VEDABASE_SHELL ||
    pathname === "/manifest.webmanifest"
  );
}

function cacheFirst(request) {
  return caches.match(request).then((cached) => cached ?? fetchAndStore(request));
}

/** Сначала сеть; кэш — только когда сети нет. */
function networkFirst(request) {
  return fetchAndStore(request).catch(() =>
    caches.match(request).then((cached) => cached ?? Response.error()),
  );
}

function fetchAndStore(request) {
  return fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  });
}

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(showNotificationUnlessOpen(payload));
});

async function showNotificationUnlessOpen(payload) {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  // Если человек прямо сейчас смотрит на этот экран, уведомление лишнее —
  // обновляем открытую страницу вместо него.
  const focused = windows.find(
    (client) =>
      client.visibilityState === "visible" &&
      new URL(client.url).pathname === payload.url,
  );
  if (focused) {
    focused.postMessage({ type: "push-received", payload });
    return;
  }
  // Входящий звонок: кнопки прямо в уведомлении и настойчивость — оно не
  // должно свернуться само, пока звонят. Тег «call:» ставит API.
  const isCall = typeof payload.tag === "string" && payload.tag.startsWith("call:");
  await self.registration.showNotification(payload.title, {
    body: payload.body,
    tag: payload.tag,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url },
    ...(isCall
      ? {
          requireInteraction: true,
          vibrate: [300, 200, 300, 200, 300],
          actions: [
            { action: "answer", title: "Ответить" },
            { action: "decline", title: "Отклонить" },
          ],
        }
      : {}),
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let url = event.notification.data?.url ?? "/";
  // «Отклонить» из уведомления: страница откроется с меткой и сама
  // отклонит звонок — сервис-воркер не знает адреса API и не ходит в него.
  if (event.action === "decline") url += (url.includes("?") ? "&" : "?") + "callAction=decline";
  if (event.action === "answer") url += (url.includes("?") ? "&" : "?") + "callAction=answer";
  event.waitUntil(openTarget(url));
});

async function openTarget(url) {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const existing = windows[0];
  if (existing) {
    await existing.focus();
    if ("navigate" in existing) await existing.navigate(url);
    return;
  }
  await self.clients.openWindow(url);
}

// Браузер сменил подписку. Новую на сервер отправит страница при следующей
// загрузке: адрес API сюда не зашит, sw.js не проходит через сборку.
self.addEventListener("pushsubscriptionchange", (event) => {
  const applicationServerKey =
    event.oldSubscription?.options?.applicationServerKey;
  if (!applicationServerKey) return;
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    }),
  );
});
