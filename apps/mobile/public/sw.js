// Service worker веб-версии приложения (ios.vedamatch.com).
//
// Кэшируется только оболочка: JS-бандл и ассеты Expo лежат по адресам с
// хешем содержимого и не меняются, поэтому «сначала кэш». Навигация — «сначала
// сеть», без сети — сохранённый index.html (приложение одностраничное).
// Запросы к API идут на другой домен и сюда не попадают вовсе: личные данные
// в кэше не оседают.
const CACHE_NAME = 'vedamatch-app-shell-v1';
const SHELL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([SHELL, '/manifest.webmanifest', '/icons/icon-192.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('vedamatch-app-shell-') && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Свежая оболочка — на случай следующего запуска без сети.
          const copy = response.clone();
          if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(SHELL, copy));
          return response;
        })
        .catch(() => caches.match(SHELL)),
    );
    return;
  }

  if (url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});

// ===== Уведомления (VED-313) =====
//
// Устройство то же, что у сервис-воркера основного сайта
// (`apps/web/public/sw.js`): сервер шлёт один и тот же payload
// `{ title, body, url, tag }` всем веб-подписчикам, поэтому и разбирается он
// здесь так же. Расхождения два, оба вынужденные, и оба описаны у своего
// кода ниже: адрес приводится к экрану приложения (`appPathFor`) и
// уведомление показывается всегда (`showPush`).

/** Разделы сайта, у которых в приложении есть свой экран. */
const APP_SECTIONS = new Set(['people', 'communities']);
/**
 * Служебные страницы переписки сайта, похожие на беседу по форме пути
 * (`/chat/with/<id>`, `/chat/people`, `/chat/appearance`). Тот же список, что
 * у `NOT_CONVERSATIONS` в `src/lib/push/push-url.ts`.
 */
const NOT_CONVERSATIONS = new Set(['with', 'people', 'appearance']);

/**
 * Адрес из уведомления → экран приложения.
 *
 * Сервер не знает про веб-сборку и кладёт в `url` путь САЙТА: `/chat/<id>`,
 * `/notifications`, `/market/<id>` и другие. Экранов у приложения меньше, чем
 * страниц у портала, и по незнакомому пути expo-router показал бы «Unmatched
 * Route» — то есть нажатие на уведомление выглядело бы поломкой. Незнакомое
 * ведём на главную: там колокольчик и вкладки, человек найдёт своё сам. Это
 * то же правило, по которому живёт нативная сборка (`pushTarget`), только
 * здесь оно нужно ДО открытия окна, а значит внутри воркера.
 *
 * Проверяется тестом `scripts/sw-push.test.mjs` — он исполняет этот файл в
 * песочнице и зовёт функцию напрямую.
 */
function appPathFor(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.startsWith('/')) return '/';
  const parts = rawUrl.split(/[?#]/)[0].split('/').filter(Boolean);
  if (parts.length === 0) return '/';
  if (parts.length === 1 && parts[0] === 'account') return '/account';
  if (parts.length === 2 && parts[0] === 'chat') {
    if (parts[1] === 'requests') return '/chat/requests';
    return NOT_CONVERSATIONS.has(parts[1]) ? '/' : `/chat/${parts[1]}`;
  }
  if (parts.length === 2 && APP_SECTIONS.has(parts[0])) return `/${parts[0]}/${parts[1]}`;
  return '/';
}

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(showPush(payload));
});

/**
 * Уведомление показывается ВСЕГДА — в отличие от сайта, где открытый на том
 * же адресе экран его гасит (`showNotificationUnlessOpen`).
 *
 * Причина в том, ради чего вся эта работа и делается: на iPhone пуши
 * приходят только приложению с домашнего экрана, и Safari следит, чтобы
 * каждый доставленный пуш заканчивался видимым уведомлением. Пуш, на который
 * воркер ничего не показал, WebKit считает «тихим»: сначала показывает вместо
 * нас служебное «страница обновилась в фоне», а после нескольких подряд —
 * молча отзывает подписку. Потерять доставку целиком хуже, чем один лишний
 * баннер поверх открытой беседы.
 *
 * Открытым окнам при этом сообщаем о пуше: страница может обновить список,
 * не дожидаясь нажатия.
 */
async function showPush(payload) {
  const url = appPathFor(payload.url);
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) client.postMessage({ type: 'push-received', payload });
  await self.registration.showNotification(payload.title || 'VedaMatch', {
    body: payload.body ?? '',
    tag: payload.tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url },
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // `data.url` положили мы сами в `showPush` — он уже приведён к экрану
  // приложения. У уведомления, показанного старой версией воркера, поля нет.
  event.waitUntil(openTarget(appPathFor(event.notification.data?.url ?? '/')));
});

async function openTarget(url) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = windows[0];
  if (!existing) {
    await self.clients.openWindow(url);
    return;
  }
  // Фокус и переход независимы, и отказ в одном не должен срывать другое:
  // браузер вправе отклонить `focus()` (окно установленного приложения он и
  // так выводит сам), а `navigate()` есть не везде. Без этих `catch` отказ в
  // фокусе оставлял человека на том же экране — нажатие на уведомление
  // выглядело как «ничего не произошло» (поймано живой проверкой в Chrome).
  await existing.focus().catch(() => undefined);
  if ('navigate' in existing) await existing.navigate(url).catch(() => undefined);
}

// Браузер сменил подписку сам. Новую на сервер отправит страница при
// следующем запуске (`syncWebPushSubscription`): адрес API сюда не зашит —
// sw.js лежит в `public/` и через сборку не проходит.
self.addEventListener('pushsubscriptionchange', (event) => {
  const applicationServerKey = event.oldSubscription?.options?.applicationServerKey;
  if (!applicationServerKey) return;
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey }),
  );
});
