import { BOOKMARK_PATH_MAX, BOOKMARK_TITLE_MAX } from '@vedamatch/shared';

/**
 * Разбор того, что присылает закладка (VED-163).
 *
 * Чистая логика отдельно от сервиса: правила «что такое адрес внутри
 * портала» проверяются тестом, а не открытой вкладкой. См. «Тесты» в
 * CLAUDE.md.
 */

/** Адрес не прошёл проверку — сервис превращает это в 400. */
export class BookmarkInputError extends Error {
  constructor(readonly code: 'path' | 'title') {
    super(code);
    this.name = 'BookmarkInputError';
  }
}

/**
 * Приведение адреса к виду, в котором он ляжет в базу и станет ссылкой.
 *
 * Закладка — это переход внутри портала, поэтому принимается только путь с
 * ведущей косой чертой. Отдельно отсекаются формы, которые браузер считает
 * внешним адресом, хотя выглядят они как путь: `//example.com` и
 * `/\example.com` уводят с портала, то есть превращают список закладок в
 * готовый открытый редирект. Якорь отбрасывается — на сервере он всё равно
 * не существует, а в базе плодил бы две закладки на одну страницу.
 */
export function normalizeBookmarkPath(raw: unknown): string {
  if (typeof raw !== 'string') throw new BookmarkInputError('path');
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) throw new BookmarkInputError('path');
  // Второй символ-разделитель означает «другой сайт», как бы он ни выглядел.
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    throw new BookmarkInputError('path');
  }
  // Пробелы и управляющие символы в пути — это не адрес портала. Проверяем
  // по кодам, а не выражением: управляющие символы в регулярке запрещены
  // правилом `no-control-regex`, и запрет здесь по делу — такое выражение
  // читается хуже цикла.
  for (const char of trimmed) {
    const code = char.codePointAt(0)!;
    if (code <= 0x20 || code === 0x7f) throw new BookmarkInputError('path');
  }
  const withoutHash = trimmed.split('#')[0];
  // «/music/» и «/music» — одна страница; хвостовая черта у корня остаётся.
  const path =
    withoutHash.length > 1 && withoutHash.endsWith('/')
      ? withoutHash.slice(0, -1)
      : withoutHash;
  if (path.length === 0 || path.length > BOOKMARK_PATH_MAX) {
    throw new BookmarkInputError('path');
  }
  return path;
}

/**
 * Слаг раздела — первый сегмент пути. Нужен, чтобы список закладок читался
 * группами («Музыка», «Работа»), а не сплошной лентой. Доступ он не решает:
 * права проверяет та страница, на которую закладка ведёт.
 */
export function serviceFromBookmarkPath(path: string): string {
  const segment = path.split('/')[1] ?? '';
  const clean = segment.split('?')[0];
  return /^[a-z0-9-]+$/.test(clean) ? clean : '';
}

/**
 * Подпись закладки. Пустую не принимаем: список из строк «Без названия»
 * бесполезен, а подставить название за человека сервер не может — заголовок
 * страницы знает только браузер.
 */
export function normalizeBookmarkTitle(raw: unknown): string {
  if (typeof raw !== 'string') throw new BookmarkInputError('title');
  // Переводы строк из заголовка страницы схлопываем в пробел: подпись
  // однострочная.
  const title = raw.replace(/\s+/g, ' ').trim().slice(0, BOOKMARK_TITLE_MAX);
  if (title.length === 0) throw new BookmarkInputError('title');
  return title;
}
