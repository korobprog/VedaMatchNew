#!/usr/bin/env node
/**
 * Проверка входа мини-приложения Telegram внутри `<iframe>` на чужом
 * происхождении — воспроизводит Telegram Desktop/web.telegram.org, в отличие
 * от телефона, где WebView открывает мини-приложение top-level и cookie
 * портала первосторонняя. На телефоне баг не воспроизводится вообще —
 * проверять там нечего.
 *
 * НЕ часть CI: отдельный ручной/дежурный скрипт, как `calls.e2e.mjs` рядом.
 * `playwright` берём из `apps/web` (там уже стоит `@playwright/test` с
 * загруженным Chromium) через `createRequire`, а не как свою зависимость
 * `apps/mobile`.
 *
 * Сценарий:
 *   1. Подписываем `initData` тестовым токеном бота (тот же алгоритм, что и
 *      `apps/api/src/modules/auth/telegram-init-data.ts`): HMAC-SHA256.
 *   2. Поднимаем свою крошечную HTML-страницу («Telegram Desktop») на
 *      `127.0.0.1:FRAME_PORT`, которая встраивает уже собранную веб-версию
 *      (`WEB_ORIGIN`, порт из другого хоста/порта — обязательно ДРУГОЕ
 *      происхождение, иначе iframe не третьесторонний и проверка ничего не
 *      доказывает) в `<iframe>` с фрагментом `#tgWebAppData=...`.
 *   3. Внутри iframe ждём список чатов (подпись вкладки «Чаты» —
 *      `(tabs)/_layout.tsx`) — это и есть `status === 'signed'`
 *      (`root-shell.tsx`, `Stack.Protected guard={status === 'signed'}`).
 *   4. Проверяем, что в контексте браузера нет ни одной cookie портала
 *      (`access_token`/`refresh_token`/`vm_session`) — вход держится только
 *      на токенах в памяти вкладки (`telegram-web-session-strategy.ts`).
 *
 * Переменные окружения:
 *   WEB_ORIGIN         — origin уже собранной и отданной веб-версии, ЦЕЛИКОМ
 *                         указывающей на тестовый API (см. ниже), например
 *                         http://localhost:8101.
 *   TELEGRAM_BOT_TOKEN  — тот же токен, что у API из WEB_ORIGIN
 *                         (`TELEGRAM_BOT_TOKEN` в его окружении) — иначе
 *                         подпись не пройдёт проверку и увидим экран с
 *                         ошибкой входа вместо списка чатов.
 *   FRAME_PORT          — порт хост-страницы «Telegram Desktop» (по
 *                         умолчанию 8102; обязан отличаться от порта
 *                         WEB_ORIGIN, чтобы iframe был третьесторонним).
 *   TELEGRAM_USER_ID, TELEGRAM_FIRST_NAME — кем «представляется» Telegram
 *                         (по умолчанию — новый демо-человек, заведётся сам).
 *   HEADLESS            — "false" запускает с видимым окном.
 *
 * Пример прогона (сначала поднять API и собрать/раздать веб-версию — см.
 * README.md, раздел «Telegram: вход внутри iframe»):
 *
 *   WEB_ORIGIN=http://localhost:8101 \
 *   TELEGRAM_BOT_TOKEN=123456:LOCAL-test-token-000000000000000000 \
 *   node apps/mobile/e2e-web/telegram-frame.e2e.mjs
 */
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(
  path.join(fileURLToPath(import.meta.url), '..', '..', '..', 'web', 'package.json'),
);
const { chromium } = require('@playwright/test');

const WEB_ORIGIN = need('WEB_ORIGIN').replace(/\/+$/, '');
const TELEGRAM_BOT_TOKEN = need('TELEGRAM_BOT_TOKEN');
const FRAME_PORT = Number(process.env.FRAME_PORT ?? 8102);
const HEADLESS = process.env.HEADLESS !== 'false';
const TIMEOUT_MS = 30_000;
const TELEGRAM_USER_ID = Number(process.env.TELEGRAM_USER_ID ?? 900_321_654);
const TELEGRAM_FIRST_NAME = process.env.TELEGRAM_FIRST_NAME ?? 'Playwright';
const PORTAL_COOKIE_NAMES = ['access_token', 'refresh_token', 'vm_session'];

function need(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Переменная ${name} не задана — см. шапку файла для списка обязательных переменных.`);
    process.exit(1);
  }
  return value;
}

/** Тот же алгоритм, что `verifyTelegramInitData`
 *  (`apps/api/src/modules/auth/telegram-init-data.ts`): все поля, кроме
 *  `hash`, по алфавиту `key=value` через `\n`, ключ — HMAC-SHA256 токена
 *  бота со строкой `WebAppData`, подпись — hex HMAC-SHA256 этим ключом. */
function signInitData(token, user) {
  const fields = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify(user),
  };
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

function frameHostHtml(iframeSrc) {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Telegram Desktop (эмуляция)</title></head>
<body style="margin:0">
  <iframe id="tg-frame" src="${iframeSrc}" style="width:100vw;height:100vh;border:0"></iframe>
</body>
</html>`;
}

function startFrameHost(html, port) {
  return new Promise((resolve, reject) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  const initData = signInitData(TELEGRAM_BOT_TOKEN, {
    id: TELEGRAM_USER_ID,
    first_name: TELEGRAM_FIRST_NAME,
  });
  const iframeSrc = `${WEB_ORIGIN}/#tgWebAppData=${encodeURIComponent(initData)}&tgWebAppVersion=8.0`;
  const server = await startFrameHost(frameHostHtml(iframeSrc), FRAME_PORT);
  const frameHostOrigin = `http://127.0.0.1:${FRAME_PORT}`;
  console.log(`Хост-страница «Telegram Desktop»: ${frameHostOrigin}`);
  console.log(`Мини-приложение внутри iframe (чужое происхождение): ${WEB_ORIGIN}`);

  const browser = await chromium.launch({ headless: HEADLESS });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(frameHostOrigin, { waitUntil: 'load' });

    const tgFrame = page.frameLocator('#tg-frame');
    console.log('Жду вход и список чатов внутри iframe...');
    // Вкладка «Чаты» нижнего меню (`(tabs)/_layout.tsx`) — та же надпись
    // дублируется заголовком экрана, поэтому целимся именно в `tab`, а не в
    // произвольный текст.
    await tgFrame.getByRole('tab', { name: 'Чаты' }).waitFor({ timeout: TIMEOUT_MS });
    console.log('OK: внутри iframe на чужом происхождении показан список чатов (нижнее меню вкладок).');

    const cookies = await context.cookies();
    const portalCookies = cookies.filter((cookie) => PORTAL_COOKIE_NAMES.includes(cookie.name));
    if (portalCookies.length > 0) {
      throw new Error(
        `Ожидались токены без единой cookie портала, но найдены: ${portalCookies.map((c) => c.name).join(', ')}`,
      );
    }
    console.log('OK: ни одной cookie портала в браузере — сессия держится только на токенах в памяти вкладки.');

    console.log('\nВсё пройдено: мини-приложение в iframe на чужом происхождении входит без cookie портала.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error('\nПроверка входа Telegram внутри iframe провалилась:', error);
  process.exitCode = 1;
});
