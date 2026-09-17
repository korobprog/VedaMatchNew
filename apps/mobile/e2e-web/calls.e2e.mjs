#!/usr/bin/env node
/**
 * Проверка звонков в веб-сборке между двумя браузерами — веха 5.
 *
 * НЕ часть CI: отдельный ручной/дежурный скрипт, поднимающий два
 * независимых «пользователя» (два `BrowserContext` Playwright, разные
 * origin — иначе cookie сессии рискуют перепутаться между контекстами,
 * см. `README.md` этого пакета) поверх уже запущенных веб-сборки и API.
 *
 * `playwright` берём из `apps/web` (там уже стоит `@playwright/test` с
 * загруженным Chromium) через `createRequire`, а не как свою зависимость
 * `apps/mobile` — эта проверка не часть обычного тестового прогона пакета.
 *
 * Переменные окружения:
 *   WEB_A, WEB_B   — origin веб-сборки для пользователя A и B (разные хосты,
 *                    например http://localhost:8097 и http://127.0.0.1:8098).
 *   API_A, API_B   — origin API, на который смотрит КАЖДАЯ из сборок; хост
 *                    обязан совпадать с хостом WEB_* (две сборки), иначе
 *                    cookie сессии не видны странице; используется
 *                    здесь только для входа по паролю и чтения списка бесед,
 *                    сам звонок целиком идёт через тот API, что зашит в
 *                    сборку при экспорте — см. `README.md`, раздел «Звонки»).
 *   EMAIL_A, EMAIL_B, DEMO_PASSWORD — необязательные переопределения демо-
 *                    аккаунтов `pnpm seed:dev` (по умолчанию — Радха/Говинда).
 *   HEADLESS       — "false" запускает с видимым окном (для разбора на месте).
 *
 * Прогон:
 *   WEB_A=http://localhost:8097 WEB_B=http://127.0.0.1:8098 \
 *   API_A=http://localhost:4097 API_B=http://127.0.0.1:4097 \
 *   node apps/mobile/e2e-web/calls.e2e.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(
  path.join(fileURLToPath(import.meta.url), '..', '..', '..', 'web', 'package.json'),
);
const { chromium } = require('@playwright/test');

const WEB_A = need('WEB_A');
const WEB_B = need('WEB_B');
const API_A = need('API_A');
const API_B = need('API_B');
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'vedamatch';
const EMAIL_A = process.env.EMAIL_A ?? 'radha@demo.vedamatch.local';
const EMAIL_B = process.env.EMAIL_B ?? 'govinda@demo.vedamatch.local';
const HEADLESS = process.env.HEADLESS !== 'false';
const TIMEOUT_MS = 30_000;

function need(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Переменная ${name} не задана — см. шапку файла для списка обязательных переменных.`);
    process.exit(1);
  }
  return value.replace(/\/+$/, '');
}

/**
 * Костыль только для этого прогона, не для приложения: на части машин
 * (замечено на macOS без реального аудиовхода) `getUserMedia({audio:true})`
 * с флагом `--use-fake-device-for-media-stream` виснет НАВСЕГДА именно на
 * подстановке под `deviceId: 'default'` — Chromium, похоже, пытается
 * прочитать параметры настоящего дефолтного устройства ввода через CoreAudio
 * даже в «фейковом» режиме, и зависает, если реального микрофона/разрешения
 * на него нет вовсе. `getUserMedia({video:true})` и запрос под КОНКРЕТНЫЙ
 * (не «default») id фейкового устройства при этом отрабатывают мгновенно —
 * подменяем `deviceId` на первое не-`default` фейковое аудиоустройство ДО
 * того, как приложение вызовет `getUserMedia` само (`webrtc-session.ts`
 * этого не знает и не должен — правка целиком в `initScript` тестового
 * контекста, `startLocalMedia` продолжает просить обычный `audio: true`).
 */
async function patchAudioDeviceForSandbox(context) {
  await context.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const patched = { ...constraints };
      const needsDeviceId =
        patched.audio === true || (patched.audio && typeof patched.audio === 'object' && !patched.audio.deviceId);
      if (needsDeviceId) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const nonDefault = devices.find(
          (d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default',
        );
        if (nonDefault) {
          patched.audio = { ...(patched.audio === true ? {} : patched.audio), deviceId: { exact: nonDefault.deviceId } };
        }
      }
      return original(patched);
    };
  });
}

/** Вход по паролю (`DEV_AUTH_ENABLED=true`) — cookie сессии оседает в
 *  `context.request`, общем с обычными `page` этого контекста (Playwright
 *  делит один cookie jar на весь `BrowserContext`). */
async function devLogin(context, apiOrigin, email) {
  const response = await context.request.post(`${apiOrigin}/auth/dev-login`, {
    data: { email, password: DEMO_PASSWORD },
  });
  if (!response.ok()) {
    throw new Error(
      `dev-login для ${email} на ${apiOrigin} вернул ${response.status()}: ${await response.text()}`,
    );
  }
}

/** Личный диалог Радха/Говинда уже существует в демо-данных
 *  (`pnpm seed:dev`) — единственная беседа вида `direct` у этого аккаунта. */
async function findDirectConversationId(context, apiOrigin) {
  const response = await context.request.get(`${apiOrigin}/chat/conversations`);
  if (!response.ok()) {
    throw new Error(`GET /chat/conversations вернул ${response.status()}: ${await response.text()}`);
  }
  const { conversations } = await response.json();
  const direct = conversations.find((item) => item.kind === 'direct');
  if (!direct) throw new Error('Личная беседа Радхи и Говинды не найдена — прогнали ли pnpm seed:dev?');
  return direct.id;
}

/** «Соединение» без внутренней разметки: строка таймера разговора
 *  (`useElapsedLabel`/`formatElapsed`, `app/call/[id].tsx`) появляется
 *  ровно тогда, когда `call-provider.tsx` получил `RTCPeerConnection`
 *  `connectionState === 'connected'` (`onConnected` в `webrtc-session.ts`) —
 *  этого достаточно, не читая внутренности WebRTC через `page.evaluate`.
 *  Ищем именно по `aria-live="polite"` (`accessibilityLiveRegion="polite"`
 *  экрана звонка, единственного текста с этим атрибутом в приложении) —
 *  простой текстовый поиск `м:сс` цепляет ещё и историю звонков в самой
 *  беседе («Аудиозвонок · 00:03» у уже завершённых вызовов), а те строки
 *  скрыты за скроллом и не проходят проверку видимости. */
async function waitConnected(page, who) {
  await page
    .locator('[aria-live="polite"]', { hasText: /^\d+:\d{2}$/ })
    .first()
    .waitFor({ timeout: TIMEOUT_MS });
  console.log(`  [${who}] соединение установлено (таймер разговора виден)`);
}

async function waitReturnedToIdle(page, who) {
  // Экран звонка уходит сам через ~3с после конца разговора
  // (`ENDED_AUTOCLOSE_MS`, `call-provider.tsx`) — кнопки звонка в шапке
  // снова кликабельны.
  await page.getByRole('button', { name: 'Аудиозвонок' }).waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  console.log(`  [${who}] вернулись в беседу, кнопки звонка снова доступны`);
}

async function runCallScenario(browser, kind) {
  console.log(`\n=== ${kind === 'video' ? 'Видеозвонок' : 'Аудиозвонок'} ===`);
  const contextA = await browser.newContext({ baseURL: WEB_A, permissions: ['camera', 'microphone'] });
  const contextB = await browser.newContext({ baseURL: WEB_B, permissions: ['camera', 'microphone'] });
  await patchAudioDeviceForSandbox(contextA);
  await patchAudioDeviceForSandbox(contextB);

  try {
    await devLogin(contextA, API_A, EMAIL_A);
    await devLogin(contextB, API_B, EMAIL_B);
    const conversationId = await findDirectConversationId(contextA, API_A);
    console.log(`  беседа: ${conversationId}`);

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    // Открыт ли уже живой поток `GET /chat/stream` — до него дожидаемся,
    // прежде чем звонить: событие `call.ringing` SSE не буферизует и не
    // повторяет тем, кто подключился позже него (`chat-stream.tsx`
    // переоткрывает поток при каждом заходе в беседу), поэтому звонок,
    // начатый ДО того, как у собеседника установилось соединение,
    // прилетел бы в никуда — реальный человек тоже не звонит быстрее, чем
    // открывается вкладка, но здесь это гонка, а не человеческая пауза.
    const streamOpen = (page) => page.waitForResponse((res) => res.url().includes('/chat/stream') && res.ok());
    // НЕ `waitUntil: 'networkidle'`: сам этот SSE-запрос долгоживущий, сеть
    // никогда не «затихает», пока беседа открыта — ждём загрузки документа
    // отдельно от потока и элементов на странице.
    await Promise.all([
      pageA.goto(`${WEB_A}/chat/${conversationId}`, { waitUntil: 'load' }),
      pageB.goto(`${WEB_B}/chat/${conversationId}`, { waitUntil: 'load' }),
      streamOpen(pageA),
      streamOpen(pageB),
    ]);
    await Promise.all([
      pageA.getByRole('button', { name: 'Аудиозвонок' }).waitFor({ timeout: TIMEOUT_MS }),
      pageB.getByRole('button', { name: 'Аудиозвонок' }).waitFor({ timeout: TIMEOUT_MS }),
    ]);

    const startLabel = kind === 'video' ? 'Видеозвонок' : 'Аудиозвонок';
    console.log(`  A: нажимает «${startLabel}»`);
    await pageA.getByRole('button', { name: startLabel }).click();

    console.log('  B: ждёт баннер входящего и отвечает');
    await pageB.getByRole('button', { name: 'Ответить на звонок' }).waitFor({ timeout: TIMEOUT_MS });
    await pageB.getByRole('button', { name: 'Ответить на звонок' }).click();

    await Promise.all([waitConnected(pageA, 'A'), waitConnected(pageB, 'B')]);

    if (kind === 'video') {
      console.log('  проверяю, что удалённое видео реально рисует кадры (videoWidth > 0)');
      await pageA.waitForFunction(
        () => Array.from(document.querySelectorAll('video')).some((v) => v.videoWidth > 0),
        undefined,
        { timeout: TIMEOUT_MS },
      );
      await pageB.waitForFunction(
        () => Array.from(document.querySelectorAll('video')).some((v) => v.videoWidth > 0),
        undefined,
        { timeout: TIMEOUT_MS },
      );
      console.log('  видео идёт с обеих сторон');
    }

    console.log('  A: завершает звонок');
    await pageA.getByRole('button', { name: 'Завершить звонок' }).click();

    await Promise.all([waitReturnedToIdle(pageA, 'A'), waitReturnedToIdle(pageB, 'B')]);

    console.log(`=== ${kind === 'video' ? 'Видеозвонок' : 'Аудиозвонок'}: OK ===`);
  } finally {
    await contextA.close();
    await contextB.close();
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  try {
    await runCallScenario(browser, 'audio');
    await runCallScenario(browser, 'video');
    console.log('\nВсё пройдено: аудио- и видеозвонок соединяются и корректно завершаются.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('\nПроверка звонков провалилась:', error);
  process.exitCode = 1;
});
