export type MotivationProfileType = 'user' | 'in_goodness' | 'yogi' | 'devotee';
export type MotivationAudienceTrack = 'universal' | 'vaishnava';
export type MotivationAttributionKind = 'exact_quote' | 'faithful_paraphrase' | 'ai_reflection';
export type MotivationLanguage = 'ru' | 'en' | 'hi';
export type MotivationReviewStatus = 'discovered' | 'source_verified' | 'text_review' | 'image_queued' | 'image_review' | 'published' | 'rejected' | 'failed';
export type MotivationQuoteSourceType = 'vedamatch_library' | 'approved_web' | 'manual';
export type MotivationTranslationKind = 'official' | 'vedamatch';
export type MotivationVisualStyle = 'spiritual_watercolor' | 'cinematic_nature' | 'indian_miniature' | 'sacred_architecture' | 'minimal_symbolism' | 'warm_documentary' | 'cosmic_contemplation' | 'historical_editorial';

export interface MotivationQuoteTranslationDto {
  language: MotivationLanguage;
  quoteText: string;
  translationKind: MotivationTranslationKind;
  label: string | null;
}

export interface MotivationQuoteDto {
  id: string;
  originalText: string;
  originalLanguage: string;
  author: string;
  work: string;
  locator: string;
  sourceType: MotivationQuoteSourceType;
  sourceUrl: string | null;
  contextExcerpt: string;
  verified: boolean;
  translations: MotivationQuoteTranslationDto[];
}

export interface MotivationPostDto {
  id: string;
  slug: string;
  contentDate: string;
  profileType: MotivationProfileType;
  audienceTrack: MotivationAudienceTrack;
  category: string;
  imageUrl: string;
  storyImageUrl: string;
  title: string;
  text: string;
  storyText: string;
  attributionKind: MotivationAttributionKind;
  attributionSpeaker: string | null;
  attributionWork: string | null;
  attributionLocator: string | null;
  attributionSourceUrl: string | null;
  sourceVerified: boolean;
  publishedAt: string;
  isFavorite: boolean;
  isViewed: boolean;
}

export interface MotivationFeedResponse { items: MotivationPostDto[]; nextCursor: string | null }
export type MotivationPostStatus = 'draft' | 'generating' | 'published' | 'failed' | 'hidden';
export interface MotivationAdminPostDto extends MotivationPostDto {
  status: MotivationPostStatus;
  generationStage: string | null;
  generationErrorCode: string | null;
  attemptCount: number;
}
export interface MotivationAdminCandidateDto extends MotivationAdminPostDto {
  reviewStatus: MotivationReviewStatus;
  quote: MotivationQuoteDto | null;
  profileTypes: MotivationProfileType[];
  visualStyle: MotivationVisualStyle | null;
  imagePrompt: string | null;
  textApprovedAt: string | null;
  imageApprovedAt: string | null;
}
export interface MotivationPreferenceDto { vaishnavaPercent: number; language: MotivationLanguage }
export interface MotivationPreferenceUpdate { vaishnavaPercent: number; language?: MotivationLanguage }
export interface MotivationAdminUpdate { hidden?: boolean; category?: string; translations?: Partial<Record<MotivationLanguage, { title: string; text: string; storyText: string }>> }
export interface MotivationApproveTextInput { visualStyle?: MotivationVisualStyle }
export interface MotivationRejectInput { reason: string }
export interface MotivationRegenerateImageInput { visualStyle?: MotivationVisualStyle }

export interface MotivationAuthorWatchDto {
  id: string;
  name: string;
  language: string | null;
  enabled: boolean;
  createdAt: string;
  lastSearchedAt: string | null;
  lastResultCount: number;
}
export interface MotivationAuthorWatchInput { name: string; language?: string }

export interface MotivationSourceWatchDto {
  id: string;
  url: string;
  label: string | null;
  enabled: boolean;
  createdAt: string;
  lastFetchedAt: string | null;
  lastResultCount: number;
}
export interface MotivationSourceWatchInput { url: string; label?: string }

/**
 * Категория справочника. Вложенность ровно в два уровня: у категории верхнего
 * уровня `parentId === null`, у подкатегории он указывает на неё.
 */
export interface MotivationCategoryDto {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  isDefault: boolean;
  parentId: string | null;
  postCount: number;
}
export interface MotivationCategoryInput { title: string; parentId?: string | null }
export interface MotivationCategoryUpdate {
  title?: string;
  sortOrder?: number;
  isDefault?: boolean;
  parentId?: string | null;
}

/** Обязательны только текст и автор — остальное уточняется по желанию. */
export interface MotivationManualQuoteInput {
  originalText: string;
  originalLanguage: string;
  author: string;
  work?: string;
  locator?: string;
  sourceUrl?: string;
  contextExcerpt?: string;
  category?: string;
}
export interface MotivationManualQuoteResult {
  quoteId: string;
  postId: string;
}

/**
 * Текст мотивации на одном языке, написанный админом. Обязателен только
 * заголовок: без пояснения карточка показывает одну цитату.
 */
export interface MotivationManualCopy {
  title: string;
  explanation?: string;
  storyText?: string;
}

/**
 * Мотивация, у которой весь текст написан руками. Нейросеть здесь не участвует
 * — от неё остаётся только изображение, которое по-прежнему проходит обычное
 * одобрение.
 */
export interface MotivationManualPostInput extends MotivationManualQuoteInput {
  copy: MotivationManualCopy;
  /** Переводы на остальные языки; незаполненные берут текст основного. */
  translations?: Partial<Record<MotivationLanguage, MotivationManualCopy>>;
  profileTypes: MotivationProfileType[];
  audienceTrack: MotivationAudienceTrack;
  visualStyle?: MotivationVisualStyle;
  contentDate?: string;
  /** Накладывать ли цитату и подпись на кадр для Stories. По умолчанию да. */
  storyCaption?: boolean;
}
export interface MotivationManualPostResult {
  quoteId: string;
  postId: string;
  reviewStatus: MotivationReviewStatus;
}

export interface MotivationSearchResult { foundCount: number }
