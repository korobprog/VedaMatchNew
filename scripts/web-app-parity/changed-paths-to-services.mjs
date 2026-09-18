#!/usr/bin/env node
// Разбор изменённых путей мержа в main → список затронутых сервисов
// каталога (VED-215). Чистая логика, без сети и без git — раннер
// (`run.mjs`) отдаёт сюда результат `git diff --name-only`.
//
//   node --test scripts/web-app-parity/changed-paths-to-services.test.mjs

/**
 * Белый список — каталог сервисов, один в один с
 * `apps/api/prisma/seed.cjs:48-235` (12 записей `slug:`). Раунд 001 показал
 * на 30 последних мержах `main`, что чёрный список из портальной
 * инфраструктуры (см. `EXCLUDED_SERVICES` ниже) пропускал 22 из 40 карточек
 * на несервисные папки веба (`admin`, `notifications`, `landing`, `app`,
 * `vaishnava`, `pwa`, `audit`, `users`, `m`, `share` — первая папка после
 * `apps/web/src/app/` считалась сервисом, а сервисом каталога не была).
 * Белый список — единственный барьер, который это чинит: слаг обязан быть
 * из этого списка, а не просто «не входить в шесть исключений».
 *
 * `card-content.mjs` строит `SERVICE_NAMES` поверх этого же списка (импорт
 * в одну сторону: `card-content.mjs` → отсюда, `dedupe-existing-card.mjs`
 * уже импортирует `buildCardTitle` из `card-content.mjs` — обратного
 * импорта отсюда в `card-content.mjs` нет и не будет).
 */
export const CATALOG_SERVICES = [
  'union',
  'vedabase',
  'motivation',
  'library',
  'astro',
  'market',
  'chat',
  'music',
  'work',
  'notices',
  'wellness',
  'travel',
];

/**
 * Портальная инфраструктура из docs/service-module-contract.md — второй,
 * избыточный барьер: белый список `CATALOG_SERVICES` сам по себе уже не
 * пропустит `auth`/`moderation`/… (их там нет), но список остаётся здесь и
 * документирует, почему именно эти слаги не сервис, а не просто «слага нет
 * в каталоге по недосмотру».
 */
export const EXCLUDED_SERVICES = [
  'auth',
  'moderation',
  'communities',
  'health',
  'stats',
  'assistant',
];

const SERVICE_PATH_PREFIXES = [
  'apps/web/src/app/',
  'apps/web/src/components/',
  'apps/api/src/modules/',
];

/**
 * Слаг сервиса из пути после известного префикса, либо `null`, если путь —
 * не сервисная папка (файл прямо в корне группы, например `layout.tsx`, или
 * маршрутная группа Next.js без собственной вложенной папки).
 *
 * Next.js «route groups» (`(portal)`, `(auth)`…) не входят в URL и стоят
 * между `app/` и слагом сервиса у части экранов веба — пропускаем любое
 * число ведущих сегментов в круглых скобках, прежде чем взять слаг.
 */
function serviceSlugFromRelativePath(relativePath) {
  const segments = relativePath.split('/').filter(Boolean);
  let index = 0;
  while (index < segments.length && /^\(.+\)$/.test(segments[index])) {
    index += 1;
  }
  // Нужен ещё хотя бы один сегмент после слага — иначе это файл на уровне
  // самой группы (`app/(portal)/layout.tsx`), а не папка сервиса.
  if (index >= segments.length - 1) return null;
  return segments[index];
}

/**
 * Слаг сервиса каталога для одного пути, либо `null` — если путь не под
 * известным префиксом, не сервисная папка, или сервис не входит в белый
 * список каталога (`CATALOG_SERVICES`) / входит в список исключений.
 */
function catalogServiceForPath(path, catalog, excluded) {
  if (typeof path !== 'string' || path.length === 0) return null;

  const prefix = SERVICE_PATH_PREFIXES.find((candidate) =>
    path.startsWith(candidate),
  );
  if (!prefix) return null;

  const relativePath = path.slice(prefix.length);
  const service = serviceSlugFromRelativePath(relativePath);
  if (!service) return null;
  if (excluded.has(service)) return null;
  if (!catalog.has(service)) return null;
  return service;
}

/**
 * Изменённые пути, сгруппированные по сервису каталога — карточке одного
 * сервиса нужны только его пути, не весь список PR (см. фикс Н3 раунда
 * 001: до этого карточка «Общение» несла и пути «Админки» того же PR).
 *
 * @param {string[]} paths — изменённые файлы мержа (`git diff --name-only`).
 * @returns {Map<string, string[]>} сервис → его пути, в порядке первого
 *   появления сервиса и путей внутри него.
 */
export function groupChangedPathsByService(paths) {
  const catalog = new Set(CATALOG_SERVICES);
  const excluded = new Set(EXCLUDED_SERVICES);
  const grouped = new Map();

  for (const path of paths ?? []) {
    const service = catalogServiceForPath(path, catalog, excluded);
    if (!service) continue;

    if (!grouped.has(service)) grouped.set(service, []);
    grouped.get(service).push(path);
  }

  return grouped;
}

/**
 * @param {string[]} paths — изменённые файлы мержа (`git diff --name-only`).
 * @returns {string[]} слаги затронутых сервисов каталога, без повторов, в
 *   порядке первого появления.
 */
export function servicesFromPaths(paths) {
  return [...groupChangedPathsByService(paths).keys()];
}
