#!/usr/bin/env node
// Заголовок и тело карточки «ДОГНАТЬ» (VED-215): один сервис веба —
// одна карточка в колонке «VedaMath-Native», без сети.
import { CATALOG_SERVICES } from './changed-paths-to-services.mjs';

/**
 * Слаг сервиса → человеческое имя, как в каталоге (`apps/api/prisma/seed.cjs`
 * и остальные пять захардкоженных мест из чек-листа
 * `docs/service-module-contract.md` — это осознанное шестое). Ключи —
 * ровно `CATALOG_SERVICES` (белый список раунда 002, см.
 * `changed-paths-to-services.mjs`), проверено тестом
 * «SERVICE_NAMES покрывает ровно CATALOG_SERVICES».
 *
 * `vacancies` — исключение раунда 003 (`CATALOG_SERVICES_WITHOUT_SEED_ENTRY`):
 * у «Вакансий» нет записи `Service` в сиде, имя не оттуда, а из заголовков
 * `apps/web/src/app/(portal)/vacancies/` и README.
 *
 * Сервис без записи здесь (случается только при прямом вызове
 * `buildCardTitle` мимо `servicesFromPaths`, например в тестах) получает
 * заголовок со слагом как есть, а не падает — маппинг не обязан покрывать
 * произвольный ввод.
 */
export const SERVICE_NAMES = {
  union: 'Знакомства',
  vedabase: 'Библиотека',
  motivation: 'Вдохновение',
  library: 'Образование',
  astro: 'Астрология',
  market: 'Рынок',
  chat: 'Общение',
  music: 'Музыка',
  work: 'Работа',
  notices: 'Объявления',
  wellness: 'Здоровье',
  vacancies: 'Вакансии',
  travel: 'Путешествия',
};

/** Пункты настоящего чек-листа доски (`POST /work/tasks/:id/checklist`) —
 * `run.mjs` заводит их отдельным запросом после создания карточки, а не
 * markdown-текстом внутри описания: только так они видны на доске и
 * считаются в `checklistDone/checklistTotal` (раунд 001, Н5). Ровно два
 * пункта, как в живом тексте карточки VED-215 на доске
 * («перенести в приложение» / «не нужно в приложении»); третий пункт из
 * раунда 001 («это ссылка — проверить, что ссылка жива») был не пунктом
 * чек-листа, а пояснением для сервисов-ссылок — теперь это текст
 * `LINK_ONLY_NOTE` в теле, а не взаимоисключающий чекбокс.
 */
export const CHECKLIST_ITEMS = ['перенести в приложение', 'не нужно в приложении'];

const LINK_ONLY_NOTE =
  'Если сервис в приложении сейчас открывается только внешней ссылкой — ' +
  'достаточно проверить, что ссылка жива, и отметить «не нужно в приложении».';

/** Максимум путей, показанных в теле карточки списком — дальше «и ещё N». */
const MAX_LISTED_PATHS = 15;

/**
 * Префикс заголовка карточки — им же ищет дубликаты `findExistingCard`, той
 * же функцией, чтобы дедуп не разошёлся с генерацией заголовка.
 */
export function buildCardTitle(service) {
  const name = SERVICE_NAMES[service] ?? service;
  return `ДОГНАТЬ. ${name}:`;
}

/** Заголовок целиком: префикс сервиса + короткое summary из PR. */
export function buildCardFullTitle(service, prTitle) {
  const prefix = buildCardTitle(service);
  const summary = (prTitle ?? '').trim();
  return summary ? `${prefix} ${summary}` : prefix;
}

function formatChangedPaths(changedPaths) {
  const paths = (changedPaths ?? []).filter(
    (path) => typeof path === 'string' && path.length > 0,
  );
  if (paths.length === 0) {
    return '_список путей пуст_';
  }

  const shown = paths.slice(0, MAX_LISTED_PATHS);
  const lines = shown.map((path) => `- \`${path}\``);
  const rest = paths.length - shown.length;
  if (rest > 0) {
    lines.push(`- и ещё ${rest} путей`);
  }
  return lines.join('\n');
}

/**
 * Тело новой карточки: ссылка на PR и **только пути этого сервиса**
 * (`changedPaths` — уже отфильтрованный по сервису список, раунд 001 нашёл
 * баг: сюда передавали весь список путей PR целиком, и карточка «Общение»
 * несла пути «Админки» того же PR). Настоящий чек-лист доски заводится
 * отдельным запросом в `run.mjs`, здесь — только пояснение для ссылок.
 */
export function buildCardBody({ service, prUrl, prTitle, changedPaths }) {
  const title = (prTitle ?? '').trim();
  const link = (prUrl ?? '').trim() || '_ссылка на PR не указана_';

  return [
    `PR: ${link}`,
    title ? `Заголовок PR: ${title}` : null,
    '',
    'Изменённые пути:',
    formatChangedPaths(changedPaths),
    '',
    LINK_ONLY_NOTE,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

/** Комментарий к уже существующей карточке — новый PR не создаёт вторую. */
export function buildCommentBody({ prUrl, prTitle, changedPaths }) {
  const title = (prTitle ?? '').trim();
  const link = (prUrl ?? '').trim() || '_ссылка на PR не указана_';

  return [
    `Ещё один PR затронул этот сервис: ${link}`,
    title ? `Заголовок PR: ${title}` : null,
    '',
    'Изменённые пути этого PR:',
    formatChangedPaths(changedPaths),
  ]
    .filter((line) => line !== null)
    .join('\n');
}

// Проверка на рассинхрон с CATALOG_SERVICES — падает сразу при импорте, а
// не только в тесте, если кто-то добавит сервис в один список и забудет
// про другой.
const missingNames = CATALOG_SERVICES.filter((slug) => !(slug in SERVICE_NAMES));
if (missingNames.length > 0) {
  throw new Error(
    `card-content.mjs: SERVICE_NAMES не покрывает CATALOG_SERVICES: ${missingNames.join(', ')}`,
  );
}
