import { CHAT_MESSAGE_MAX_LENGTH } from '@vedamatch/shared';

/**
 * Тексты постов официального канала VedaMatch. Чистый модуль: события шины
 * сообщают факт («новость вышла», «вышла версия»), а формулировку для
 * человека собирает подписчик — здесь.
 *
 * Ссылка пишется последней строкой полным адресом: кнопок у сообщений нет, а
 * адрес в тексте человек откроет или скопирует и на сайте, и в приложении.
 */

export const OFFICIAL_POST_SOURCE = {
  announcement: 'changelog.announcement',
  appRelease: 'app.release',
} as const;

export type OfficialPostSource =
  (typeof OFFICIAL_POST_SOURCE)[keyof typeof OFFICIAL_POST_SOURCE];

/** Поля поста, из которых собирается сообщение. */
export type OfficialPostFields = {
  source: string;
  title: string;
  body: string;
  path: string;
};

const ELLIPSIS = '…';

/**
 * Полный адрес ссылки: домен портала плюс путь из события. Без домена
 * (локальная разработка без WEB_ORIGIN) — голый путь: он хотя бы подскажет,
 * куда идти, а выдуманный домен увёл бы в никуда.
 */
export function officialPostLink(origin: string | null, path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (!origin) return cleanPath;
  return `${origin.replace(/\/+$/, '')}${cleanPath}`;
}

/**
 * Номер версии для человека. `1.4.0+abc1234` — номер пакета и хвост sha
 * сборки: sha человеку ничего не говорит, а номер сборки (versionCode) —
 * да, по нему видно, что вышло новое, даже если номер пакета не менялся.
 */
export function humanVersion(versionName: string, versionCode: number): string {
  const base = versionName.split('+')[0].trim();
  return base ? `${base} (сборка ${versionCode})` : `сборка ${versionCode}`;
}

/**
 * Текст поста. Шапка и ссылка неприкосновенны, укорачивается только тело:
 * лимит сообщения чата — 2000 знаков, а новость в админке длиннее не
 * ограничена. Обрезанное тело кончается многоточием — полный текст по ссылке.
 */
export function officialPostText(
  post: OfficialPostFields,
  origin: string | null,
): string {
  const link = officialPostLink(origin, post.path);
  const head = headOf(post);
  const tail = tailOf(post, link);
  const body = post.body.trim();
  const frame = [head, tail].join('\n\n');
  if (!body) return frame.slice(0, CHAT_MESSAGE_MAX_LENGTH);
  const room = CHAT_MESSAGE_MAX_LENGTH - frame.length - 4;
  return [head, fitBody(body, room), tail].join('\n\n');
}

function headOf(post: OfficialPostFields): string {
  const title = post.title.trim();
  if (post.source === OFFICIAL_POST_SOURCE.appRelease) return `📲 ${title}`;
  return `📰 ${title}`;
}

function tailOf(post: OfficialPostFields, link: string): string {
  if (post.source === OFFICIAL_POST_SOURCE.appRelease)
    return [
      `Скачать или обновить: ${link}`,
      'В приложении с сайта: «Сервисы» → «Проверить обновление».',
    ].join('\n');
  return `Подробнее: ${link}`;
}

function fitBody(body: string, room: number): string {
  if (room <= ELLIPSIS.length) return ELLIPSIS;
  if (body.length <= room) return body;
  return `${body.slice(0, room - ELLIPSIS.length).trimEnd()}${ELLIPSIS}`;
}

/**
 * Поля поста о выпуске приложения. Заголовок и тело здесь, а не у издателя:
 * он сообщает номер и заметку, слова подбирает подписчик.
 */
export function appReleasePostFields(input: {
  versionName: string;
  versionCode: number;
  notes: string | null;
}): { title: string; body: string } {
  const notes = input.notes?.trim();
  return {
    title: `Вышла версия ${humanVersion(input.versionName, input.versionCode)} приложения VedaMatch для Android`,
    body: notes ? `Что нового:\n${notes}` : 'Исправления и улучшения.',
  };
}
