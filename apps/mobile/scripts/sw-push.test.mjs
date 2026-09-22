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
