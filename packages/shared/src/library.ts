export type LibraryEntryType =
  | 'website'
  | 'article'
  | 'video'
  | 'audio'
  | 'book'
  | 'course'
  | 'app'
  | 'telegram_channel'
  | 'vk_group'
  | 'community'
  | 'other';

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
  /** `true` — текущий пользователь добавил ссылку либо является админом. */
  canEdit: boolean;
  /** `true` — обложка загружена вручную, а не взята автоматически с сайта-источника. */
  hasCustomPreview: boolean;
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
 * Заполнено должно быть хотя бы одно из `url` / `source`: у цитаты из книги
 * адреса нет, у видео — наоборот, обязателен. Проверяют и сервис, и
 * CHECK-ограничение в базе.
 */
export interface CreateLibraryEntryRequest {
  url?: string | null;
  source?: string | null;
  type: LibraryEntryType;
  contentLanguage: string;
  titleRu?: string | null;
  titleEn?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  categoryIds: string[];
}

/** Все поля необязательны — меняются только переданные. Адрес ссылки (url)
 *  не редактируется: он завязан на дедупликацию и normalizedUrl. */
export interface UpdateLibraryEntryRequest {
  /** Новый адрес. Пустая строка снимает его — так можно только у материала
   *  с заполненным источником. */
  url?: string | null;
  type?: LibraryEntryType;
  contentLanguage?: string;
  titleRu?: string | null;
  titleEn?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  categoryIds?: string[];
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
}

export interface UpdateLibraryPreferencesRequest {
  uiLanguage?: LibraryLocale;
  contentLanguages?: string[];
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
