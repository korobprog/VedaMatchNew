#!/usr/bin/env node
// Заголовок и тело карточки «ДОГНАТЬ» (VED-215): один сервис веба —
// одна карточка в колонке «VedaMath-Native», без сети.

/**
 * Слаг сервиса → человеческое имя, как в каталоге (`apps/api/prisma/seed.cjs`
 * и остальные пять захардкоженных мест из чек-листа
 * `docs/service-module-contract.md` — это осознанное шестое). Сервис без
 * записи здесь получает заголовок со слагом как есть, а не падает —
 * маппинг не исчерпывает список модулей репозитория (например, у устаревшего
 * `gitabase` записи в каталоге больше нет).
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
  travel: 'Путешествия',
};

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

const CHECKLIST = [
  '- [ ] перенести в приложение',
  '- [ ] в приложении это ссылка — проверить, что ссылка жива',
  '- [ ] не нужно в приложении',
].join('\n');

/**
 * Тело новой карточки: ссылка на PR, изменённые пути, чек-лист. Тот же
 * набор данных используется и для комментария к уже существующей карточке
 * (`buildCommentBody`) — только без повторного чек-листа.
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
    'Чек-лист:',
    CHECKLIST,
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
