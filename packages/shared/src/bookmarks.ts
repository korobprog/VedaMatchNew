// Закладки портала (VED-163). Отдельный портальный раздел, а не сервис
// каталога: закладка ссылается на любой адрес портала — исполнителя в
// Музыке, доску в Работе, книгу в Образовании, — и записи `Service` у неё
// нет. См. docs/service-module-contract.md.

/** Сколько закладок держит один человек. Больше — это уже не «под рукой». */
export const BOOKMARKS_LIMIT = 200;

/** Ограничения полей; те же числа проверяет сервер. */
export const BOOKMARK_TITLE_MAX = 120;
export const BOOKMARK_PATH_MAX = 512;

export interface BookmarkDto {
  id: string;
  /** Относительный адрес внутри портала, всегда с ведущей косой чертой. */
  path: string;
  title: string;
  /**
   * Слаг раздела, вычисленный из пути (`music`, `work`, `library`); пустая
   * строка — главная и прочие адреса без раздела. Нужен только для
   * группировки списка, доступ он не решает.
   */
  service: string;
  createdAt: string;
}

export interface BookmarkListResponse {
  items: BookmarkDto[];
  /** Сколько ещё поместится: форма гасит кнопку до отправки. */
  limit: number;
}

export interface CreateBookmarkRequest {
  path: string;
  title: string;
}

export interface UpdateBookmarkRequest {
  title: string;
}
