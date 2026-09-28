/**
 * Сервис-воркер веб-сборки (`public/sw.js`) через сборку не проходит и модулей
 * не экспортирует, поэтому его правило «адрес из уведомления → экран
 * приложения» проверяется так: файл исполняется в песочнице `node:vm` с
 * заглушкой `self`, после чего функция зовётся напрямую.
 *
 * Правило — единственное место воркера, где есть что ломать: незнакомый путь
 * обязан вести на главную, иначе нажатие на уведомление открывает «Unmatched
 * Route» вместо экрана (VED-313).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'public', 'sw.js'), 'utf8');

function loadServiceWorker() {
  const listeners = new Map();
  const self = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    location: { origin: 'https://ios.vedamatch.com' },
    clients: {},
    registration: {},
    skipWaiting: () => undefined,
  };
  const context = vm.createContext({ self, caches: {}, fetch: () => undefined, URL, Response });
  vm.runInContext(source, context);
  return { context, listeners };
}

const { context, listeners } = loadServiceWorker();
const appPathFor = (url) => vm.runInContext('appPathFor', context)(url);

test('воркер подписан на push и notificationclick', () => {
  assert.ok(listeners.has('push'), 'нет обработчика push');
  assert.ok(listeners.has('notificationclick'), 'нет обработчика notificationclick');
  assert.ok(listeners.has('pushsubscriptionchange'), 'нет обработчика pushsubscriptionchange');
});

test('беседа открывается своим экраном', () => {
  assert.equal(appPathFor('/chat/abc123'), '/chat/abc123');
  // Сервер добавляет к пропущенному звонку метку `?call=` — экран тот же.
  assert.equal(appPathFor('/chat/abc123?call=c-1'), '/chat/abc123');
  assert.equal(appPathFor('/chat/abc123#anchor'), '/chat/abc123');
});

test('свои экраны приложения сохраняются', () => {
  assert.equal(appPathFor('/chat/requests'), '/chat/requests');
  assert.equal(appPathFor('/people/u-1'), '/people/u-1');
  assert.equal(appPathFor('/communities/c-1'), '/communities/c-1');
  assert.equal(appPathFor('/account'), '/account');
});

test('страницы сайта без экрана в приложении ведут на главную', () => {
  assert.equal(appPathFor('/notifications'), '/');
  assert.equal(appPathFor('/market/orders/1'), '/');
  assert.equal(appPathFor('/chat/people'), '/');
  assert.equal(appPathFor('/chat/appearance'), '/');
  assert.equal(appPathFor('/chat/with/u-1'), '/');
  assert.equal(appPathFor('/people'), '/');
});

test('мусор вместо адреса — главная, а не падение', () => {
  assert.equal(appPathFor(undefined), '/');
  assert.equal(appPathFor(null), '/');
  assert.equal(appPathFor(42), '/');
  assert.equal(appPathFor(''), '/');
  assert.equal(appPathFor('/'), '/');
  // Чужой адрес: без ведущей косой в `clients.openWindow` уводить некуда.
  assert.equal(appPathFor('https://example.com/chat/1'), '/');
});

test('пуш без данных или с битыми данными всё равно показывает уведомление', () => {
  // На iPhone пуш без уведомления — «тихий», и за несколько таких Safari
  // отзывает подписку (VED-313).
  const readPush = vm.runInContext('readPush', context);
  const fallback = { title: 'VedaMatch', body: 'Новое уведомление', url: '/' };
  assert.deepEqual({ ...readPush(null) }, fallback);
  assert.deepEqual({ ...readPush({ json: () => { throw new SyntaxError('bad'); } }) }, fallback);
  assert.deepEqual({ ...readPush({ json: () => 'строка' }) }, fallback);
  const payload = { title: 'Сообщение', body: 'Привет', url: '/chat/1', tag: 'chat:1' };
  assert.deepEqual({ ...readPush({ json: () => payload }) }, payload);
});

test('после показа уведомления воркер подтверждает показ (VED-327)', async () => {
  const listeners = new Map();
  const calls = [];
  const shown = [];
  const self = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    location: { origin: 'https://ios.vedamatch.com' },
    clients: { matchAll: async () => [] },
    registration: {
      showNotification: async (title) => shown.push(title),
      pushManager: {
        getSubscription: async () => ({ endpoint: 'https://web.push.apple.com/abc' }),
      },
    },
    skipWaiting: () => undefined,
  };
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status: 204 });
  };
  vm.runInContext(source, vm.createContext({ self, caches: {}, fetch, URL, Response }));

  const receipt = { id: '3f2b8c1e-6a4d-4e0f-9b7a-1c2d3e4f5a6b', url: 'https://api.vedamatch.com/notifications/shown' };
  let work;
  listeners.get('push')({
    data: { json: () => ({ title: 'Сообщение', body: 'Привет', url: '/chat/1', receipt }) },
    waitUntil: (promise) => {
      work = promise;
    },
  });
  await work;

  assert.deepEqual(shown, ['Сообщение']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, receipt.url);
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    endpoint: 'https://web.push.apple.com/abc',
    id: receipt.id,
  });
});
