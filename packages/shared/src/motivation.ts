export type MotivationProfileType = 'user' | 'in_goodness' | 'yogi' | 'devotee';
export type MotivationAudienceTrack = 'universal' | 'vaishnava';
export type MotivationAttributionKind = 'exact_quote' | 'faithful_paraphrase' | 'ai_reflection';
export type MotivationLanguage = 'ru' | 'en' | 'hi';
export type MotivationReviewStatus = 'discovered' | 'source_verified' | 'text_review' | 'image_queued' | 'image_review' | 'published' | 'rejected' | 'failed';
export type MotivationQuoteSourceType = 'vedamatch_library' | 'approved_web' | 'manual';
export type MotivationTranslationKind = 'official' | 'vedamatch';
/**
 * Визуальные стили иллюстрации.
 *
 * Первые восемь — рисовальные, их промпт начинается словом «Illustrate».
 * Последние четыре кинематографические: у них свой зачин — «кадр из фильма»,
 * «фотография», «масляная живопись», — без которого модель возвращалась к
 * рисунку, какой бы стиль ни выбрали.
 */
export type MotivationVisualStyle =
  | 'spiritual_watercolor'
  | 'cinematic_nature'
  | 'indian_miniature'
  | 'sacred_architecture'
  | 'minimal_symbolism'
  | 'warm_documentary'
  | 'cosmic_contemplation'
  | 'historical_editorial'
  | 'cinematic_film'
  | 'epic_wide'
  | 'night_devotional'
  | 'painterly_realism';

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
  /**
   * Ролик, оживляющий иллюстрацию. Пустая строка — ролика нет либо он ещё не
   * принят: наружу отдаётся только подтверждённое администратором видео.
   */
  videoUrl: string;
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
  /**
   * Промпт правил человек, а не автосборка. Перегенерация тогда идёт с
   * сохранённым текстом, и админке есть что об этом сказать — иначе правка
   * выглядела бы потерянной.
   */
  imagePromptEdited: boolean;
  textApprovedAt: string | null;
  imageApprovedAt: string | null;
  /** Ролик, оживляющий иллюстрацию. Появляется по кнопке уже после картинки. */
  videoStatus: MotivationVideoStatus;
  /** Читать ли цитату голосом. Машинное чтение писания — решение редакции. */
  videoVoice: boolean;
  /** Выбранный голос. Пусто — берётся заданный в настройках по умолчанию. */
  videoVoiceName: string | null;
  videoErrorCode: string | null;
  /**
   * Что и как движется в ролике. Пусто — уйдёт
   * `DEFAULT_MOTIVATION_VIDEO_PROMPT`.
   */
  videoPrompt: string | null;
}

/**
 * Промпт движения по умолчанию.
 *
 * Видеомодели нужно описание движения, а не сцены: на ручной проверке промпт
 * картинки давал застывший кадр, а эта формулировка — живой ролик. Камера
 * почти неподвижна намеренно: на пяти секундах любой её проезд читается как
 * рывок, а вшитая позже подпись при движении кадра начинает плыть.
 */
export const DEFAULT_MOTIVATION_VIDEO_PROMPT =
  'Gentle natural motion: soft breeze in the leaves, slow drifting clouds, warm sunrise light. Camera almost still.';

/**
 * Сохранение промптов из админки. Поля независимы: отправляется то, что
 * действительно правили, остальное остаётся как было.
 */
export interface MotivationPromptUpdate {
  imagePrompt?: string;
  videoPrompt?: string;
}

/**
 * Жизненный цикл ролика. Отдельно от `reviewStatus`: видео — необязательное
 * обогащение готового поста, и его сбой не отменяет сам пост.
 */
/**
 * Голоса, доступные на эндпоинте озвучки.
 *
 * Список нужен обеим сторонам: бэкенд им проверяет присланное значение, веб
 * строит выпадашку. Проверка не формальность — за неизвестный голос провайдер
 * возьмёт деньги ровно так же, как за верный запрос.
 */
export const MOTIVATION_VOICES = [
  'Rachel',
  'Aria',
  'Roger',
  'Sarah',
  'Laura',
  'Charlie',
  'George',
  'Callum',
  'River',
  'Liam',
  'Charlotte',
  'Alice',
  'Matilda',
  'Will',
  'Jessica',
  'Eric',
  'Chris',
  'Brian',
  'Daniel',
  'Lily',
  'Bill',
] as const;

export type MotivationVoice = (typeof MOTIVATION_VOICES)[number];

/**
 * Настройки сервиса. Пустое значение поля означает «взять из окружения», а не
 * «пусто»: так настройки переносятся из `.env` по одной, ничего не ломая.
 * Секретов здесь нет — ключи провайдеров остаются в окружении.
 */
export interface MotivationSettingsDto {
  videoModel: string;
  videoSeconds: number;
  videoAudio: boolean;
  voiceModel: string;
  voiceName: string;
  imageModel: string;
  visualStyle: MotivationVisualStyle | null;
  dailyBudgetUsd: number;
  musicModel: string;
  defaultTrackId: string | null;
}

/**
 * Известные модели провайдеров с замеренной ценой.
 *
 * Список — подсказка, а не ограничение: поле остаётся текстовым, потому что
 * модели появляются каждый месяц и запертый список быстро стал бы клеткой.
 * Но набирать «wan/v2.6/image-to-video/flash» по памяти нельзя — опечатка
 * уходит в платный запрос.
 */
export type MotivationModelOption = { id: string; note: string };

export const MOTIVATION_VIDEO_MODELS: MotivationModelOption[] = [
  {
    id: 'wan/v2.6/image-to-video/flash',
    note: '~$0.13 за 5 с в 720p без звука',
  },
  {
    id: 'fal-ai/bytedance/seedance/v1/pro/fast/image-to-video',
    note: '~$0.10 за 5 с в 720p',
  },
  {
    id: 'fal-ai/bytedance/seedance/v1/pro/image-to-video',
    note: '~$0.26 за 5 с — замерено по счёту',
  },
  { id: 'fal-ai/vidu/q3/image-to-video', note: '~$0.39 за 5 с в 720p' },
];

export const MOTIVATION_VOICE_MODELS: MotivationModelOption[] = [
  {
    id: 'fal-ai/elevenlabs/tts/eleven-v3',
    note: '$0.10 за 1000 знаков, 70+ языков',
  },
  {
    id: 'fal-ai/elevenlabs/tts/multilingual-v2',
    note: '$0.10 за 1000 знаков, ставка на стабильность',
  },
  {
    id: 'fal-ai/elevenlabs/tts/turbo-v2.5',
    note: '$0.05 за 1000 знаков — вдвое дешевле',
  },
  {
    id: 'fal-ai/minimax/speech-02-hd',
    note: '$0.10 за 1000 знаков, 300+ голосов, свои имена голосов',
  },
];

export const MOTIVATION_IMAGE_MODELS: MotivationModelOption[] = [
  { id: 'gpt-image-2', note: 'через ваш relay' },
];

export const MOTIVATION_MUSIC_MODELS: MotivationModelOption[] = [
  { id: 'fal-ai/elevenlabs/music', note: '$0.80 за минуту' },
  { id: 'fal-ai/lyria2', note: '$0.10 за 30 с' },
  { id: 'fal-ai/ace-step', note: '$0.0002 за секунду — дешевле, но проще' },
  { id: 'cassetteai/music-generator', note: '$0.02 за минуту' },
];

export type MotivationTrackStatus = 'draft' | 'approved' | 'rejected';

/**
 * Трек музыкальной подложки. Промпт хранится рядом не для истории: по нему
 * видно, что переслушивать и от чего оттолкнуться, если нужен похожий.
 */
export interface MotivationTrackDto {
  id: string;
  title: string;
  prompt: string;
  url: string;
  seconds: number;
  status: MotivationTrackStatus;
  model: string;
  createdAt: string;
}

export type MotivationSettingsUpdate = Partial<{
  videoModel: string | null;
  videoSeconds: number | null;
  videoAudio: boolean | null;
  voiceModel: string | null;
  voiceName: string | null;
  imageModel: string | null;
  visualStyle: MotivationVisualStyle | null;
  dailyBudgetUsd: number | null;
  musicModel: string | null;
  defaultTrackId: string | null;
}>;

export type MotivationVideoStatus =
  | 'none'
  | 'queued'
  | 'running'
  | 'review'
  | 'ready'
  | 'failed';
/**
 * Настройки ленты. `profileTypes` — какие профили показывать; пустой список
 * означает «как на самоидентификации», а не «ничего не показывать».
 */
export interface MotivationPreferenceDto {
  vaishnavaPercent: number;
  language: MotivationLanguage;
  profileTypes: MotivationProfileType[];
}
export interface MotivationPreferenceUpdate {
  vaishnavaPercent: number;
  language?: MotivationLanguage;
  profileTypes?: MotivationProfileType[];
}
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

/**
 * Тип книги в библиотеке. На цитаты разбираются только `scripture` и
 * `teaching`: в биографии повествование ведёт биограф, и его слова нельзя
 * приписывать герою книги.
 */
export type MotivationBookKind = 'scripture' | 'teaching' | 'biography' | 'other';
export interface MotivationBookDto {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  language: string;
  kind: MotivationBookKind;
}
export interface MotivationBookKindInput { kind: MotivationBookKind }
