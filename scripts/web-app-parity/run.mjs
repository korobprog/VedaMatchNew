#!/usr/bin/env node
// Раннер VED-215: паритет веб → приложение. Сетевой I/O и `git` — здесь,
// не тестируется юнитом; аргументы для `fetch` собирают уже протестированные
// чистые функции модулей рядом (тот же приём, что у `story-image.ts` из
// CLAUDE.md — «тот же приём применять к сборке аргументов внешних утилит»).
//
// Вызывается шагом `.github/workflows/web-app-parity.yml` после мержа PR в
// main; входные данные — переменные окружения (см. README ниже), не CLI-флаги,
// чтобы многострочные значения (тело PR, список путей) не проходили через
// границу командной строки.
//
// Локальный тестовый прогон без сети:
//
//   WEB_APP_PARITY_CHANGED_PATHS=$'apps/web/src/app/market/page.tsx' \
//   WEB_APP_PARITY_PR_BODY='Новый фильтр' \
//   WEB_APP_PARITY_PR_URL='https://github.com/x/y/pull/1' \
//   WEB_APP_PARITY_PR_TITLE='Новый фильтр по цене' \
//   WEB_APP_PARITY_DRY_RUN=1 \
//   node scripts/web-app-parity/run.mjs
//
// Раунд 001, Б2: в dry-run нельзя глушить и `GET` — тогда дедуп (критерии
// приёмки №3/№4) в принципе не может исполниться, dry-run всегда «создаёт».
// Здесь глушится только запись (`method !== 'GET'`): с настоящим ключом и
// `WEB_APP_PARITY_DRY_RUN=1` раннер реально читает боевую доску, реально
// прогоняет дедуп по её карточкам и печатает, что бы сделал — без единой
// записи на прод.
import { fileURLToPath } from 'node:url';
import { groupChangedPathsByService } from './changed-paths-to-services.mjs';
import { isOptedOut } from './pr-body-opt-out.mjs';
import {
  CHECKLIST_ITEMS,
  buildCardBody,
  buildCardFullTitle,
  buildCommentBody,
} from './card-content.mjs';
import { findExistingCard } from './dedupe-existing-card.mjs';
import { openCardsAcrossBoard } from './open-cards.mjs';

const DEFAULT_BOARD_ID = 'f7ecf5b2-ad69-4067-ba0a-79e51643149d';
const DEFAULT_COLUMN_ID = 'd698cd1c-6697-44fa-a061-8faa6d4806f7';
const DEFAULT_API_URL = 'https://api.vedamatch.ru';

function readMultiline(value) {
  return (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function apiFetch({ apiUrl, apiKey, method, path, body, dryRun }) {
  const url = `${apiUrl}${path}`;
  // Раунд 001, Б2: dry-run глушит только запись. `GET` уходит по-настоящему
  // — иначе dry-run не может доказать дедуп (нечем сравнивать: список
  // карточек всегда пуст).
  if (dryRun && method !== 'GET') {
    console.log(`[dry-run] ${method} ${path}`, body ? JSON.stringify(body) : '');
    return { dryRun: true };
  }
  const response = await fetch(url, {
    method,
    headers: {
      // Ключ — только из окружения, только в заголовок; никогда не в текст
      // команды и никогда в лог (см. workflow: секрет попадает в `env:`).
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 500)}`);
  }
  return response.json();
}

export async function run(env = process.env) {
  const apiKey = env.VEDAMATCH_API_KEY;
  if (!apiKey) {
    console.log('::warning::Секрет VEDAMATCH_API_KEY не задан — карточки «ДОГНАТЬ» не заводятся (см. README).');
    return { skipped: true, reason: 'no-api-key' };
  }

  const changedPaths = readMultiline(env.WEB_APP_PARITY_CHANGED_PATHS);
  const prBody = env.WEB_APP_PARITY_PR_BODY ?? '';
  const prUrl = env.WEB_APP_PARITY_PR_URL ?? '';
  const prTitle = env.WEB_APP_PARITY_PR_TITLE ?? '';
  const boardId = env.WEB_APP_PARITY_BOARD_ID || DEFAULT_BOARD_ID;
  const columnId = env.WEB_APP_PARITY_COLUMN_ID || DEFAULT_COLUMN_ID;
  const apiUrl = env.VEDAMATCH_API_URL || DEFAULT_API_URL;
  const dryRun = env.WEB_APP_PARITY_DRY_RUN === '1';

  // Раунд 001, Н3: карточка сервиса должна нести только его пути, не весь
  // список путей PR целиком.
  const pathsByService = groupChangedPathsByService(changedPaths);
  const services = [...pathsByService.keys()];
  if (services.length === 0) {
    console.log('Изменённые пути не затрагивают ни один сервис каталога — карточка не заводится.');
    return { skipped: true, reason: 'no-services', services: [] };
  }

  if (isOptedOut(prBody)) {
    console.log('PR явно отмечен «Затрагивает приложение: нет» — карточки не заводятся.', { services });
    return { skipped: true, reason: 'opted-out', services };
  }

  let board = null;
  try {
    board = await apiFetch({
      apiUrl,
      apiKey,
      method: 'GET',
      path: `/work/boards/${boardId}`,
      dryRun,
    });
  } catch (error) {
    console.log(`::warning::Не удалось прочитать доску «Работа»: ${error.message}`);
    return { skipped: true, reason: 'board-fetch-failed', services };
  }

  // `GET` больше не глушится dry-run (см. Б2 выше), поэтому `board` — всегда
  // настоящий ответ API либо исключение, пойманное выше; `openCardsAcrossBoard`
  // сама вернёт `[]` на пустом/неполном объекте, если он всё-таки чем-то не тем.
  const existingCards = openCardsAcrossBoard(board);

  const results = [];
  for (const service of services) {
    const paths = pathsByService.get(service) ?? [];
    const existing = findExistingCard(existingCards, service);
    if (existing) {
      const body = buildCommentBody({ prUrl, prTitle, changedPaths: paths });
      await apiFetch({
        apiUrl,
        apiKey,
        method: 'POST',
        path: `/work/tasks/${existing.id}/comments`,
        body: { body },
        dryRun,
      });
      results.push({ service, action: 'commented', taskId: existing.id });
      continue;
    }

    const title = buildCardFullTitle(service, prTitle).slice(0, 200);
    const description = buildCardBody({ service, prUrl, prTitle, changedPaths: paths });
    const created = await apiFetch({
      apiUrl,
      apiKey,
      method: 'POST',
      path: `/work/boards/${boardId}/tasks`,
      body: { columnId, title, description },
      dryRun,
    });

    // Настоящий чек-лист доски (не markdown-текст) — раунд 001, Н5. Только
    // когда создание не было заглушено dry-run (тогда `created.id` есть).
    const taskId = created?.id;
    if (taskId) {
      for (const text of CHECKLIST_ITEMS) {
        await apiFetch({
          apiUrl,
          apiKey,
          method: 'POST',
          path: `/work/tasks/${taskId}/checklist`,
          body: { text },
          dryRun,
        });
      }
    }

    results.push({ service, action: 'created', task: created });
  }

  return { skipped: false, services, results };
}

// `fileURLToPath`, а не сравнение `pathname` строкой — путь с пробелами или
// не-ASCII символами percent-encoded в `pathname`, но не в `process.argv[1]`
// (раунд 001, Н6), и сравнение строк молча не совпадало бы никогда.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  run().catch((error) => {
    console.error(`::error::web-app-parity: ${error.message}`);
    process.exitCode = 1;
  });
}
