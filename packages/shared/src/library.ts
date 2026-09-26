import type { LineageId, LineagePreference } from './lineage';

export type LibraryEntryType =
  | 'website'
  | 'article'
  | 'video'
  | 'audio'
  | 'book'
  /** Текст целиком на портале: лекция, беседа, глава. */
  | 'katha'
  | 'course'
  | 'app'
  | 'telegram_channel'
  | 'vk_group'
  | 'community'
  | 'other'
  /**
   * Шлока (VED-386): стих с пословным переводом, переводом, комментарием,
   * картинками и прочтениями других ачарьев. Создаётся и правится своими
   * маршрутами `library/shlokas`, а не общей формой материала.
   */
  | 'shloka';

export type LibraryEntryStatus =
  | 'published'
  | 'hidden_by_reports'
  | 'removed_by_admin';

export type LibraryLocale = 'ru' | 'en';

/** Сортировки ленты. `actual` и `popular` наполняются данными в фазе B. */
export type LibraryFeedSort = 'new' | 'actual' | 'popular';

/** Корень (0) → потомок (1) → потомок потомка (2). Дублирует MAX_DEPTH
 *  сервера: интерфейсу нужно гасить недопустимые цели ещё до запроса. */
export const LIBRARY_MAX_DEPTH = 2;

/**
 * Рубрика справочника — узел одного дерева.
 *
 * Разделов как отдельной сущности больше нет: бывший раздел — это узел с
 * `parentId === null`. Адрес узла `/library/<slug>` не зависит от места в
 * дереве, поэтому перемещение не рвёт чужие ссылки.
 */
export interface LibraryCategoryDto {
  id: string;
  parentId: string | null;
  slug: string;
  titleRu: string | null;
  titleEn: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  iconKey: string | null;
  /** Порядок среди соседей; сплошной от нуля. */
  position: number;
  /** 0 — верхний уровень. */
  depth: number;
  /** Материалы самой рубрики, без потомков. */
  entriesCount: number;
  /** Материалы рубрики вместе с потомками; дубли между ветками не двоятся. */
  subtreeEntriesCount: number;
  childrenCount: number;
  createdAt: string;
  /** `true` — текущий пользователь создал рубрику либо является админом. */
  canEdit: boolean;
  /** `true` — рубрику можно перетаскивать (админ и модератор). */
  canMove: boolean;
  /**
   * `true` — рубрику можно удалить. Только администратор: автор правит свою
   * рубрику, но удаление задевает чужие материалы и чужие ссылки.
   */
  canDelete: boolean;
}

export interface LibraryCategoryTreeNode extends LibraryCategoryDto {
  children: LibraryCategoryTreeNode[];
}

/** Предок в хлебных крошках: узлу нужен путь, а не только имя родителя. */
export interface LibraryCategoryAncestor {
  id: string;
  slug: string;
  titleRu: string | null;
  titleEn: string | null;
}

export interface LibraryCategoryPageDto {
  category: LibraryCategoryDto;
  /** От корня к родителю; сама рубрика не входит. */
  ancestors: LibraryCategoryAncestor[];
  children: LibraryCategoryDto[];
}

export interface LibraryCategorySuggestion {
  id: string;
  slug: string;
  titleRu: string | null;
  titleEn: string | null;
  /** Путь от корня к родителю — иначе двух «Лекций» не различить. */
  ancestors: LibraryCategoryAncestor[];
  entriesCount: number;
  similarity: number;
}

/**
 * Перемещение рубрики: новый родитель и сосед, перед которым встать.
 *
 * `parentId: null` — вынести на верхний уровень, `beforeId: null` — встать
 * последним среди соседей. Одним запросом описываются оба намерения
 * перетаскивания: и смена уровня, и перестановка.
 */
export interface MoveLibraryCategoryRequest {
  parentId: string | null;
  beforeId?: string | null;
}

export interface LibraryEntryDto {
  id: string;
  /** `null` у материала без адреса — тогда заполнен `source`. */
  url: string | null;
  domain: string | null;
  /** Откуда материал, когда ссылки нет: «Бхагавад-гита 9.22». */
  source: string | null;
  /**
   * Текст материала целиком — у катхи и у статьи, написанной прямо на
   * портале (VED-355). Приходит только со страницы материала
   * (`GET /library/entries/:id`) и в ответе на правку; в ленте поля нет:
   * там хватает описания, а текст бывает в сотни килобайт.
   */
  body?: string | null;
  type: LibraryEntryType;
  contentLanguage: string;
  titleRu: string | null;
  titleEn: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  faviconUrl: string | null;
  previewUrl: string | null;
  status: LibraryEntryStatus;
  usefulCount: number;
  uniqueClickCount: number;
  bookmarkCount: number;
  commentsCount: number;
  /** `true` — текущий пользователь добавил ссылку в избранное. */
  bookmarked: boolean;
  publishedAt: string;
  categories: Array<
    Pick<LibraryCategoryDto, 'id' | 'slug' | 'titleRu' | 'titleEn'>
  >;
  addedBy: { id: string; name: string } | null;
  /**
   * От имени какой общины выложен материал. `null` — лично от себя.
   * Автор при этом всегда человек: `addedBy` не подменяется общиной, потому
   * что при разборе жалобы нужно знать, кто именно добавил ссылку.
   */
  community: { id: string; slug: string; name: string } | null;
  /**
   * Духовная линия материала. `null` — для всех линий. Преданный видит в
   * ленте свою линию и материалы «для всех», см. `resolveContentLineage`.
   */
  lineage: LineageId | null;
  /** `true` — текущий пользователь добавил ссылку либо является админом. */
  canEdit: boolean;
  /** `true` — обложка загружена вручную, а не взята автоматически с сайта-источника. */
  hasCustomPreview: boolean;
  /**
   * Когда материал последний раз отправили в Блог-ленту (VED-490); `null` —
   * не отправляли. Карточка показывает это отметкой с датой.
   */
  blogSharedAt: string | null;
  /**
   * Файлы книги: pdf, epub, djvu и прочие. Приходят только со страницы
   * материала; в ленте поля нет.
   */
  files?: LibraryEntryFileDto[];
  /**
   * Номер и сам стих — только у шлоки: карточка в ленте показывает его
   * шрифтом для санскрита. У остальных типов поля нет.
   */
  shloka?: { verse: string | null; text: string } | null;
}

/**
 * Форматы файлов книг, которые можно прикрепить к материалу. Порядок — для
 * подсказки: сначала то, чем читают книги, потом документы.
 */
export const LIBRARY_BOOK_FORMATS = [
  'pdf',
  'epub',
  'fb2',
  'djvu',
  'mobi',
  'doc',
  'docx',
  'odt',
  'rtf',
  'txt',
] as const;

export type LibraryBookFormat = (typeof LIBRARY_BOOK_FORMATS)[number];

/** Скан книги в djvu или pdf — десятки мегабайт; сотня с запасом. */
export const LIBRARY_BOOK_MAX_BYTES = 100 * 1024 * 1024;

/** Одна книга в нескольких форматах — да; библиотека в одной карточке — нет. */
export const LIBRARY_BOOK_FILES_PER_ENTRY = 5;

/** Формат по имени файла; `null` — такой не принимаем. `.djv` — то же, что `.djvu`. */
export function libraryBookFormatOf(fileName: string): LibraryBookFormat | null {
  const ext = /\.([a-z0-9]{2,5})$/.exec(fileName.trim().toLowerCase())?.[1];
  if (!ext) return null;
  const format = ext === 'djv' ? 'djvu' : ext;
  return (LIBRARY_BOOK_FORMATS as readonly string[]).includes(format)
    ? (format as LibraryBookFormat)
    : null;
}

export interface LibraryEntryFileDto {
  id: string;
  /** Имя, под которым файл скачается: «Бхагавад-гита как она есть.pdf». */
  name: string;
  format: LibraryBookFormat;
  sizeBytes: number;
  /** Подписанная ссылка на шесть часов: файлы лежат в закрытом бакете. */
  url: string;
  createdAt: string;
}

/** Заявка на заливку: сервер отвечает подписанной ссылкой на PUT в бакет. */
export interface CreateLibraryBookUploadRequest {
  fileName: string;
  sizeBytes: number;
}

export interface LibraryBookUploadResponse {
  /** Ключ объекта — его возвращают на завершении. */
  key: string;
  url: string;
  /** Ровно те заголовки, что вошли в подпись: разойдутся — S3 ответит 403. */
  headers: Record<string, string>;
  expiresInSeconds: number;
}

/** Заливка закончена: сервер сверяет объект и прикрепляет файл к материалу. */
export interface CompleteLibraryBookUploadRequest {
  key: string;
  fileName: string;
}

export interface LibraryFeedResponse {
  items: LibraryEntryDto[];
  /** `null` — данных больше нет. */
  nextCursor: string | null;
  total: number;
}

export interface CreateLibraryCategoryRequest {
  /** `null` — рубрика верхнего уровня; такую заводит только админ. */
  parentId: string | null;
  titleRu?: string | null;
  titleEn?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  /** `true` — пользователь подтвердил создание при найденных похожих. */
  force?: boolean;
}

/**
 * Все поля необязательны — меняются только переданные. Слаг не
 * пересчитывается: на него уже могли сослаться извне. Место в дереве
 * меняет отдельный `move`, а не это тело.
 */
export interface UpdateLibraryCategoryRequest {
  titleRu?: string | null;
  titleEn?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  iconKey?: string | null;
}

export type LibrarySectionRequestStatus = 'pending' | 'approved' | 'rejected';

/**
 * Заявка на новый раздел. Разделы заводит администрация, но участнику,
 * которому не нашлось подходящего, нужен способ попросить.
 */
export interface LibrarySectionRequestDto {
  id: string;
  titleRu: string;
  titleEn: string;
  reason: string | null;
  status: LibrarySectionRequestStatus;
  /** Кто просил — админу решать по человеку, а не по одному названию. */
  requestedByName: string | null;
  /** Комментарий администратора к решению. */
  decision: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface LibrarySectionRequestsState {
  requests: LibrarySectionRequestDto[];
  /** Сколько ждёт решения — значок на вкладке админки. */
  pendingCount: number;
}

export interface CreateLibrarySectionRequestBody {
  titleRu: string;
  titleEn: string;
  reason?: string | null;
}

export interface DecideLibrarySectionRequestBody {
  action: 'approve' | 'reject';
  comment?: string | null;
}

/** Тело ответа `422` при похожей существующей категории. */
export interface CreateLibraryCategoryConflict {
  code: 'similar_category_exists';
  suggestions: LibraryCategorySuggestion[];
}

/**
 * Заполнено должно быть хотя бы одно из `url` / `source` / `body`: у цитаты
 * из книги адреса нет, у видео — наоборот, обязателен, а катхе (`katha`)
 * обязателен собственный текст. Проверяют и сервис, и CHECK-ограничение в
 * базе. Статья текст принимает наравне с катхой, но не требует: она бывает
 * и ссылкой на чужой сайт, и перепечаткой рядом с ней.
 */
export interface CreateLibraryEntryRequest {
  url?: string | null;
  source?: string | null;
  /** Текст целиком — у катхи и статьи. До 200 000 знаков. */
  body?: string | null;
  type: LibraryEntryType;
  contentLanguage: string;
  titleRu?: string | null;
  titleEn?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  categoryIds: string[];
  /** Опубликовать от имени общины. `null` или отсутствие — лично от себя. */
  communityId?: string | null;
  /**
   * Линия материала. Отсутствие — линия автора, если он преданный, иначе
   * ISKCON (`defaultLineageFor`); явный `null` — для всех линий.
   */
  lineage?: LineageId | null;
}

/** Все поля необязательны — меняются только переданные. Адрес ссылки (url)
 *  не редактируется: он завязан на дедупликацию и normalizedUrl. */
export interface UpdateLibraryEntryRequest {
  /** Новый адрес. Пустая строка снимает его — так можно только у материала
   *  с заполненным источником. */
  url?: string | null;
  /** Текст материала. `null` снимает его — если материалу остаётся на что
   *  указывать и это не катха: катхе текст обязателен. */
  body?: string | null;
  type?: LibraryEntryType;
  contentLanguage?: string;
  titleRu?: string | null;
  titleEn?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  categoryIds?: string[];
  /** Сменить общину или снять её (`null`). Право перепроверяется на правке. */
  communityId?: string | null;
  /** Сменить линию; `null` — для всех линий. */
  lineage?: LineageId | null;
}

/**
 * Организация, от имени которой в каталоге есть материалы.
 *
 * Не весь справочник общин портала: фильтр показывает ровно те, по которым
 * что-то найдётся.
 */
export interface LibraryCommunityFacet {
  id: string;
  slug: string;
  name: string;
  entriesCount: number;
}

export interface LibraryPreviewUploadResponse {
  previewUrl: string;
}

export type LibraryCommentStatus =
  | 'published'
  | 'removed_by_author'
  | 'removed_by_admin';

export interface LibraryCommentDto {
  id: string;
  entryId: string;
  body: string;
  status: LibraryCommentStatus;
  createdAt: string;
  author: { id: string; name: string } | null;
  /** `true` — комментарий можно удалить текущим пользователем. */
  canDelete: boolean;
}

export interface LibraryCommentsResponse {
  items: LibraryCommentDto[];
  total: number;
}

export interface CreateLibraryCommentRequest {
  body: string;
}

/** Тело ответа `409` при уже существующем URL. */
export interface LibraryDuplicateEntryConflict {
  code: 'entry_already_exists';
  entry: LibraryEntryDto;
}

export interface LibraryPreferencesDto {
  uiLanguage: LibraryLocale;
  contentLanguages: string[];
  /**
   * Какую линию смотреть в Образовании. `null` — как в портальном профиле,
   * `'all'` — все линии. См. `LineagePreference`.
   */
  lineage: LineagePreference;
}

export interface UpdateLibraryPreferencesRequest {
  uiLanguage?: LibraryLocale;
  contentLanguages?: string[];
  lineage?: LineagePreference;
}

// ===== Админка Library =====

export type LibraryCategoryStatus =
  | 'active'
  | 'hidden_by_reports'
  | 'merged'
  | 'removed';

/** `not_applicable` — обогащать нечего: у материала нет ссылки, только источник. */
export type LibraryEnrichmentStatus =
  | 'pending'
  | 'queued'
  | 'ready'
  | 'failed'
  | 'not_applicable';

/** Категория глазами администрации: с автором, статусом и счётчиками. */
export interface LibraryAdminCategoryDto {
  id: string;
  parentId: string | null;
  /** Путь от корня к родителю: без него две одноимённые рубрики из разных
   *  веток в админском списке неразличимы. */
  ancestors: LibraryCategoryAncestor[];
  slug: string;
  titleRu: string | null;
  titleEn: string | null;
  status: LibraryCategoryStatus;
  entriesCount: number;
  followersCount: number;
  /** Куда слита категория; заполнено только у статуса `merged`. */
  mergedIntoId: string | null;
  /** Мирское имя автора: админский экран. `null` — аккаунт удалён. */
  createdByName: string | null;
  createdAt: string;
}

/**
 * Кандидаты на слияние: категории с одинаковым нормализованным названием.
 * Пользователи заводят категории сами, и дубли — вопрос времени.
 */
export interface LibraryAdminDuplicateGroup {
  /** Нормализованное название, по которому категории признаны дублями. */
  normalized: string;
  categories: LibraryAdminCategoryDto[];
}

export interface MergeLibraryCategoryRequest {
  /** Категория, в которую переносятся записи. Исходная станет `merged`. */
  targetId: string;
}

/** Запись каталога глазами администрации. */
export interface LibraryAdminEntryDto {
  id: string;
  /** `null` у материала без адреса — у него заполнен `source`. */
  url: string | null;
  domain: string | null;
  type: LibraryEntryType;
  titleRu: string | null;
  titleEn: string | null;
  status: LibraryEntryStatus;
  enrichmentStatus: LibraryEnrichmentStatus;
  enrichmentError: string | null;
  previewUrl: string | null;
  addedByName: string | null;
  categories: string[];
  usefulCount: number;
  commentsCount: number;
  createdAt: string;
}

export interface LibraryAdminEntryListResponse {
  items: LibraryAdminEntryDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface LibraryAdminEntryQuery {
  /** Поиск по адресу, домену и заголовкам. */
  q?: string;
  status?: LibraryEntryStatus;
  /** Только те, у кого обогащение так и не отработало. */
  notEnrichedOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface LibraryAdminStats {
  entries: { total: number; published: number; removed: number; notEnriched: number };
  categories: { total: number; active: number; merged: number; duplicates: number };
  /** Рубрик верхнего уровня — бывший счётчик разделов. */
  roots: number;
}

// ===== Шлоки (VED-386) =====

/**
 * Пределы полей шлоки. Одни на сервер и форму: форма гасит лишнее до
 * отправки, сервер — если форма старая.
 */
export const LIBRARY_SHLOKA_LIMITS = {
  verse: 40,
  text: 5_000,
  wordByWord: 10_000,
  translation: 5_000,
  /** Комментарий бывает страницами — как у Прабхупады к Гите. */
  commentary: 100_000,
  acharyaName: 120,
  acharyas: 20,
  /** На шлоку вместе с блоками ачарьев. */
  images: 12,
  /** Размер одной картинки до сжатия. */
  imageBytes: 8 * 1024 * 1024,
} as const;

export interface LibraryShlokaImageDto {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  /** `null` — картинка самой шлоки, иначе блока «другого ачарьи». */
  acharyaId: string | null;
}

/** Прочтение стиха другим ачарьей: всё то же, что у шлоки, плюс имя. */
export interface LibraryShlokaAcharyaDto {
  id: string;
  acharya: string;
  text: string | null;
  wordByWord: string | null;
  translation: string | null;
  commentary: string | null;
  images: LibraryShlokaImageDto[];
}

/** Сосед по источнику — для стрелок «назад» и «вперёд». */
export interface LibraryShlokaNeighbor {
  id: string;
  verse: string | null;
}

/** Окно шлоки: сам стих, его источник и соседи по порядку стихов. */
export interface LibraryShlokaDto {
  id: string;
  titleRu: string | null;
  /** Строка источника: «Бхагавад-гита». Проставляется по рубрике. */
  source: string;
  verse: string | null;
  text: string;
  wordByWord: string | null;
  translation: string | null;
  commentary: string | null;
  contentLanguage: string;
  images: LibraryShlokaImageDto[];
  acharyas: LibraryShlokaAcharyaDto[];
  /** Рубрика-источник: по ней листаются стрелки. */
  category: LibraryCategoryAncestor | null;
  prev: LibraryShlokaNeighbor | null;
  next: LibraryShlokaNeighbor | null;
  /** Место в источнике с единицы; 0 — шлока вне рубрики. */
  position: number;
  total: number;
  canEdit: boolean;
  bookmarked: boolean;
  bookmarkCount: number;
  commentsCount: number;
  addedBy: { id: string; name: string } | null;
  publishedAt: string;
}

/** Строка в окне источника. */
export interface LibraryShlokaListItem {
  id: string;
  verse: string | null;
  text: string;
  /** Начало перевода — до 240 знаков. */
  translation: string | null;
  imagesCount: number;
  acharyasCount: number;
}

export interface LibraryShlokaListResponse {
  category: LibraryCategoryAncestor;
  /** Что подставить в поле «Источник» новой шлоки этого раздела. */
  sourceLabel: string;
  items: LibraryShlokaListItem[];
  /** Сколько шлок подходит под запрос (без поиска — всего в источнике). */
  total: number;
  /** Смещение следующей страницы; `null` — страница последняя. */
  nextOffset: number | null;
}

/** Блок «другого ачарьи» в запросе. С `id` — правка существующего. */
export interface LibraryShlokaAcharyaInput {
  id?: string;
  acharya: string;
  text?: string | null;
  wordByWord?: string | null;
  translation?: string | null;
  commentary?: string | null;
}

export interface CreateLibraryShlokaRequest {
  /** Рубрика-источник. Из неё же берётся строка источника, если не задана. */
  categoryId: string;
  source?: string | null;
  verse?: string | null;
  text: string;
  wordByWord?: string | null;
  translation?: string | null;
  commentary?: string | null;
  contentLanguage?: string;
  acharyas?: LibraryShlokaAcharyaInput[];
}

/**
 * Правка: меняются только переданные поля. `acharyas` — весь список
 * целиком: блоки без `id` добавляются, пропавшие из списка удаляются.
 */
export type UpdateLibraryShlokaRequest = Partial<
  Omit<CreateLibraryShlokaRequest, 'categoryId'>
>;

/**
 * Рубрика про шлоки — по названию: «Шлоки», «Шлока», «Shlokas», «Ślokas».
 *
 * По названию, а не флагом, потому что раздел «Шлоки» на проде уже заведён
 * руками как обычная рубрика: флаг пришлось бы ещё кому-то поставить, а
 * название уже есть. Один на сервер и веб, чтобы оба узнавали одинаково.
 */
export function isLibraryShlokaTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return /(шлок|shlok|ślok|slok)/iu.test(title.normalize('NFC'));
}

/**
 * Строка источника для шлоки из раздела: названия рубрик от раздела «Шлоки»
 * (не включая его) до самой рубрики — «Шримад-Бхагаватам, Песнь 1». Если
 * раздела «Шлоки» среди предков нет, — название самой рубрики.
 */
export function libraryShlokaSourceLabel(
  ancestors: ReadonlyArray<{ titleRu: string | null; titleEn: string | null }>,
  category: { titleRu: string | null; titleEn: string | null },
): string {
  const title = (row: { titleRu: string | null; titleEn: string | null }) =>
    row.titleRu?.trim() || row.titleEn?.trim() || '';
  const chain = [...ancestors, category];
  let rootIndex = -1;
  chain.forEach((row, index) => {
    if (index < chain.length - 1 && isLibraryShlokaTitle(title(row)))
      rootIndex = index;
  });
  if (rootIndex < 0) return title(category);
  return chain
    .slice(rootIndex + 1)
    .map(title)
    .filter(Boolean)
    .join(', ');
}

/** Ответ на «В Блог-ленту» (VED-490): пост в ленте и новая отметка материала. */
export interface LibraryBlogShareResponse {
  postId: string;
  blogSharedAt: string;
}

/**
 * Событие шины: материал Образования отправляют в Блог-ленту (VED-490).
 * Слушает «Блог-лента», публикует пост от имени отправителя и возвращает
 * `BlogLinkPostResult` — издатель зовёт emitAsync.
 *
 * Самодостаточно: блог не читает таблицы Образования, поэтому заголовок,
 * описание, обложка и адрес материала едут здесь снимком на момент отправки.
 */
export interface LibraryBlogShareRequestedEvent {
  requesterId: string;
  requesterIsAdmin: boolean;
  entryId: string;
  title: string | null;
  text: string;
  /** Путь на портале: `/library/entry/<id>`. */
  url: string;
  imageUrl: string | null;
  /** Подпись ссылки в посте: «Образование». */
  label: string;
}
