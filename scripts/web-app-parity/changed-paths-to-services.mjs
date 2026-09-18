#!/usr/bin/env node
// Разбор изменённых путей мержа в main → список затронутых сервисов
// каталога (VED-215). Чистая логика, без сети и без git — раннер
// (`run.mjs`) отдаёт сюда результат `git diff --name-only`.
//
//   node --test scripts/web-app-parity/changed-paths-to-services.test.mjs

/**
 * Портальная инфраструктура из docs/service-module-contract.md: у неё нет
 * отдельного экрана в приложении, и заводить на неё карточку «ДОГНАТЬ»
 * бессмысленно. Список исчерпывающий и экспортируется отдельно, чтобы тест
 * мог проверить каждое исключение по имени.
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
 * @param {string[]} paths — изменённые файлы мержа (`git diff --name-only`).
 * @returns {string[]} слаги затронутых сервисов, без повторов, без портальной
 *   инфраструктуры, в порядке первого появления.
 */
export function servicesFromPaths(paths) {
  const excluded = new Set(EXCLUDED_SERVICES);
  const seen = new Set();
  const result = [];

  for (const path of paths ?? []) {
    if (typeof path !== 'string' || path.length === 0) continue;

    const prefix = SERVICE_PATH_PREFIXES.find((candidate) =>
      path.startsWith(candidate),
    );
    if (!prefix) continue;

    const relativePath = path.slice(prefix.length);
    const service = serviceSlugFromRelativePath(relativePath);
    if (!service) continue;
    if (excluded.has(service)) continue;
    if (seen.has(service)) continue;

    seen.add(service);
    result.push(service);
  }

  return result;
}
