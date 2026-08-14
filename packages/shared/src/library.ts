export type LibraryEntryType =
  | 'website'
  | 'article'
  | 'video'
  | 'audio'
  | 'book'
  | 'course'
  | 'app'
  | 'telegram_channel'
  | 'community'
  | 'other';

export type LibraryEntryStatus =
  | 'published'
  | 'hidden_by_reports'
  | 'removed_by_admin';

export type LibraryLocale = 'ru' | 'en';

/** Сортировки ленты. `actual` и `popular` наполняются данными в фазе B. */
export type LibraryFeedSort = 'new' | 'actual' | 'popular';

export interface LibrarySectionDto {
  id: string;
  slug: string;
  titleRu: string;
  titleEn: string;
  descriptionRu: string | null;
  descriptionEn: string | null;
  iconKey: string | null;
  position: number;
  categoriesCount: number;
  entriesCount: number;
  /** `true` — текущий пользователь может переименовать раздел (только админ). */
  canEdit: boolean;
}

export interface LibraryCategoryDto {
  id: string;
  sectionId: string;
  sectionSlug: string;
  slug: string;
  titleRu: string | null;
  titleEn: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  entriesCount: number;
  createdAt: string;
  /** `true` — текущий пользователь создал категорию либо является админом. */
  canEdit: boolean;
}

export interface LibraryCategorySuggestion {
  id: string;
  sectionSlug: string;
  slug: string;
  titleRu: string | null;
  titleEn: string | null;
  entriesCount: number;
  similarity: number;
}

export interface LibraryEntryDto {
  id: string;
  url: string;
  domain: string;
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
    Pick<
      LibraryCategoryDto,
      'id' | 'slug' | 'sectionSlug' | 'titleRu' | 'titleEn'
    >
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
  sectionId: string;
  titleRu?: string | null;
  titleEn?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  /** `true` — пользователь подтвердил создание при найденных похожих. */
  force?: boolean;
}

/** Все поля необязательны — меняются только переданные. Раздел (sectionId)
 *  можно сменить, слаг при этом не пересчитывается: ссылки на категорию не рвутся. */
export interface UpdateLibraryCategoryRequest {
  sectionId?: string;
  titleRu?: string | null;
  titleEn?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
}

/** Разделы правит только администрация; порядок (position) здесь не меняется. */
export interface UpdateLibrarySectionRequest {
  titleRu?: string;
  titleEn?: string;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  iconKey?: string | null;
}

/** Тело ответа `422` при похожей существующей категории. */
export interface CreateLibraryCategoryConflict {
  code: 'similar_category_exists';
  suggestions: LibraryCategorySuggestion[];
}

export interface CreateLibraryEntryRequest {
  url: string;
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
