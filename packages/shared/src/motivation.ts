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

export type MotivationPostOrigin = 'editorial' | 'user';

/**
 * Фоновая запись Вдохновения — спокойный инструментал, под который читают.
 * Своя подборка сервиса: с плейлистами Музыки она не связана.
 */
export interface MotivationAudioDto {
  id: string;
  title: string;
  url: string;
  durationSeconds: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface MotivationPostDto {
  id: string;
  slug: string;
  contentDate: string;
  profileType: MotivationProfileType;
  audienceTrack: MotivationAudienceTrack;
  category: string;
  /** Название категории для показа; пусто — справочник её не знает. */
  categoryTitle: string;
  imageUrl: string;
  storyImageUrl: string;
  /**
   * Ролик, оживляющий иллюстрацию. Пустая строка — ролика нет либо он ещё не
   * принят: наружу отдаётся только подтверждённое администратором видео.
   */
  videoUrl: string;
  /**
   * Есть ли в ролике звук: озвучка цитаты или музыкальная подложка. Немой
   * ролик — обычное дело (автор мог отказаться и от того, и от другого), и
   * переключатель звука над ним только сбивал бы с толку.
   */
  videoHasSound: boolean;
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
  /** Публичный лайк, в отличие от личного избранного. */
  likeCount: number;
  isLiked: boolean;
  /** Кто завёл пост: редакция или участник — лента подписывает слайд по-разному. */
  origin: MotivationPostOrigin;
  /**
   * Автор пользовательского рилса. Имя — всегда `resolveDisplayName()`;
   * у редакционных постов пусто, подпись собирает лента.
   */
  author: { name: string } | null;
  /** Это мой рилс: на своём не предлагаем пожаловаться. */
  isOwn: boolean;
  /**
   * Ярус ленты, в который пост попал для этого человека: «свежее» — вышло
   * после прошлого визита, «непросмотренное» — архив, «повтор» — уже видел.
   * Заполняется только лентой; в остальных ответах отсутствует.
   */
  feedTier?: MotivationFeedTier;
}

export type MotivationFeedTier = 'fresh' | 'unseen' | 'seen';

// ===== Свой рилс (пользовательские посты) =====

export type MotivationAiModerationMode = 'off' | 'assist' | 'autonomous';

/**
 * Откуда цитата. Своя — свободный текст без проверенного источника: такой
 * рилс живёт в «Мои» и по ссылке. Из книги — фрагмент, выделенный в читалке
 * Vedabase; сервер сверяет его с текстом главы, и рилс может попасть в «Для вас».
 */
export type MotivationReelSource =
  | { kind: 'own'; text: string; author?: string | null }
  | { kind: 'vedabase'; text: string; bookSlug: string; chapterSlug: string };

/** Найденный в книгах фрагмент: готов и к показу, и к проверке по главе. */
export interface MotivationReelSourceHit {
  text: string;
  bookSlug: string;
  bookTitle: string;
  chapterSlug: string;
  /** «2.47» — как подписывается стих. */
  locator: string;
}

/** Книга в списке выбора: только то, из чего можно собрать цитату. */
export interface MotivationReelBookDto {
  slug: string;
  title: string;
  author: string | null;
  chapters: Array<{ slug: string; title: string }>;
}

export interface MotivationReelCreateInput {
  source: MotivationReelSource;
  language: MotivationLanguage;
  audienceTrack: MotivationAudienceTrack;
  visualStyle?: MotivationVisualStyle | null;
  /** Необязательная мысль автора под цитатой — показывается как «Пояснение». */
  explanation?: string | null;
}

/**
 * Стадия рилса глазами автора. Считается из `reviewStatus` / `generationStage`
 * поста: отдельного состояния у рилса нет, мастер лишь читает пост.
 */
export type MotivationReelStage =
  | 'ai_review'
  | 'admin_review'
  | 'rejected'
  | 'generating'
  | 'image_review'
  | 'published'
  | 'failed';

export interface MotivationReelDto {
  id: string;
  stage: MotivationReelStage;
  /** Ролик из картинки: заказывается автором отдельно после публикации. */
  videoState: MotivationReelVideoState;
  /** Можно ли заказать ролик прямо сейчас. */
  canAnimate: boolean;
  /** Причина отказа простым языком; пусто, пока отказа нет. */
  reason: string | null;
  /**
   * Объяснение, если генерация встала из-за денег: свой дневной потолок или
   * пустой счёт у провайдера. Рядом с ним показываются реквизиты — чинить
   * такой сбой автору нечем, повтор упрётся в то же самое.
   */
  fundingNotice: string | null;
  /**
   * Почему кадр всё ещё не нарисован, когда причина не в рилсе: провайдер
   * картинок перегружен и отвечает отказом. Без этой строки мастер обещает
   * «~1–2 минуты» и молчит, а ждать приходится дольше.
   */
  waitNotice: string | null;
  /**
   * Провайдер отклонил кадр по содержанию. Отдельно от waitNotice: там «само
   * дорисуется», здесь — повтор бесполезен и нужен другой кадр.
   */
  videoRejectionNotice: string | null;
  /** Можно написать администратору: рилс отклонён и обращения ещё не было. */
  canAppeal: boolean;
  sourceKind: MotivationReelSource['kind'];
  createdAt: string;
  post: MotivationPostDto;
}

/** Состояние ролика для кнопки «оживить»: очередь, работа, готово, сбой. */
export type MotivationReelVideoState =
  | 'none'
  | 'queued'
  | 'running'
  | 'review'
  | 'ready'
  | 'failed';

/** Что автор выбирает перед сборкой ролика. Всё необязательно. */
export interface MotivationReelVideoOptions {
  /** Имя голоса из MOTIVATION_VOICES; null — без озвучки. */
  voice?: MotivationVoice | null;
  /** Идентификатор музыкального трека; null — без музыки. */
  trackId?: string | null;
  /** Длина ролика в секундах; null — посчитать по озвучке или тексту. */
  seconds?: number | null;
  /** Движение в кадре: пресет вместо промпта. */
  motion?: 'calm' | 'nature' | 'zoom' | null;
}

/** Музыкальная подложка на выбор автору. */
export interface MotivationReelTrackDto {
  id: string;
  title: string;
  seconds: number;
  url: string;
}

export interface MotivationReelQuotaDto {
  enabled: boolean;
  unlimited: boolean;
  limit: number;
  used: number;
  remaining: number;
}

export interface MotivationReelAppealInput {
  message: string;
}

export interface MotivationReelCreateResult {
  id: string;
  stage: MotivationReelStage;
  reason: string | null;
}

export interface MotivationFeedResponse { items: MotivationPostDto[]; nextCursor: string | null }
export interface MotivationLikeResponse { likeCount: number; isLiked: boolean }
export type MotivationPostStatus = 'draft' | 'generating' | 'published' | 'failed' | 'hidden';
/** Сколько вдохновений в сервисе — цифра над лентой. */
export interface MotivationStatsDto {
  published: number;
}

export interface MotivationAdminPostDto extends MotivationPostDto {
  status: MotivationPostStatus;
  generationStage: string | null;
  generationErrorCode: string | null;
  attemptCount: number;
}
/** Последнее слово ИИ-модератора по посту — для карточки очереди. */
export interface MotivationAdminAiVerdictDto {
  action: 'ai_suggest' | 'ai_escalate' | 'ai_approve' | 'ai_reject' | 'ai_error' | 'ai_publish';
  /** Что предложила модель (approve/reject/escalate) и что исполнилось. */
  decision: string | null;
  resolved: string | null;
  confidence: number | null;
  flags: string[];
  reason: string | null;
  createdAt: string;
}

export interface MotivationAdminCandidateDto extends MotivationAdminPostDto {
  reviewStatus: MotivationReviewStatus;
  origin: MotivationPostOrigin;
  /** Мирское имя автора пользовательского рилса: админке нужен реальный человек. */
  authorName: string | null;
  aiVerdict: MotivationAdminAiVerdictDto | null;
  /** Обращение автора после отказа: текст и когда. */
  appeal: { message: string; createdAt: string } | null;
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
 * Как голос называть человеку. Имена провайдера («Aria», «Roger») ничего не
 * говорят о звучании, а выбирать вслепую из двадцати одного имени невозможно.
 * Голоса без подписи показываются своим именем.
 */
export const MOTIVATION_VOICE_LABELS: Partial<Record<MotivationVoice, string>> = {
  Aria: 'Женский, тёплый',
  Sarah: 'Женский, спокойный',
  Laura: 'Женский, светлый',
  Alice: 'Женский, ясный',
  Charlotte: 'Женский, мягкий',
  Roger: 'Мужской, глубокий',
  Charlie: 'Мужской, мягкий',
  George: 'Мужской, строгий',
  Brian: 'Мужской, спокойный',
  Daniel: 'Мужской, ровный',
};

/** Голос на выбор автору: подпись и готовый образец, если он уже записан. */
export interface MotivationVoiceOptionDto {
  value: MotivationVoice;
  label: string;
  /** Ссылка на образец в хранилище; null — образец ещё не записан. */
  sampleUrl: string | null;
  /** Предвыбранный вариант. */
  isDefault: boolean;
}

/**
 * Настройки сервиса. Пустое значение поля означает «взять из окружения», а не
 * «пусто»: так настройки переносятся из `.env` по одной, ничего не ломая.
 * Секретов здесь нет — ключи провайдеров остаются в окружении.
 */
// ===== Жалобы =====

export type MotivationReportReason =
  | 'spam'
  | 'offensive'
  | 'wrong_source'
  | 'other';

export const MOTIVATION_REPORT_REASONS: readonly {
  value: MotivationReportReason;
  label: string;
}[] = [
  { value: 'spam', label: 'Реклама или спам' },
  { value: 'offensive', label: 'Оскорбление или вражда' },
  { value: 'wrong_source', label: 'Неверный источник цитаты' },
  { value: 'other', label: 'Другое' },
];

export interface MotivationReportInput {
  reason: MotivationReportReason;
  comment?: string | null;
}

export interface MotivationReportResult {
  /** Сколько всего жалоб на этот рилс — админке видно, автору нет. */
  count: number;
  /** Скрыт ли рилс автоматически после этой жалобы. */
  hidden: boolean;
}

// ===== Открытки =====

/** Праздник или памятная дата, из которой рождается открытка. */
export interface MotivationEventDto {
  id: string;
  /** YYYY-MM-DD в конкретном году: лунные даты смещаются. */
  date: string;
  title: string;
  /** Текст на кадре; пусто — берётся название. */
  greeting: string | null;
  /** За сколько дней до даты открытку предлагаем. */
  leadDays: number;
  enabled: boolean;
}

export interface MotivationEventInput {
  date: string;
  title: string;
  greeting?: string | null;
  leadDays?: number;
  enabled?: boolean;
}

export interface MotivationPostcardResult {
  url: string;
  greeting: string;
}

// ===== Админка: рилсы участников и решения ИИ =====

/** Персональные правила автора; пусто — действует общий лимит сервиса. */
export interface MotivationAuthorPolicyDto {
  dailyLimit: number | null;
  trusted: boolean;
  blocked: boolean;
  note: string | null;
}

export interface MotivationAdminReelDto {
  id: string;
  slug: string;
  stage: MotivationReelStage;
  reviewStatus: MotivationReviewStatus;
  createdAt: string;
  /** Мирское имя автора: админка работает с реальным человеком. */
  authorId: string | null;
  authorName: string | null;
  authorPolicy: MotivationAuthorPolicyDto | null;
  sourceVerified: boolean;
  quoteText: string;
  imageUrl: string;
  likeCount: number;
  aiVerdict: MotivationAdminAiVerdictDto | null;
  appeal: { message: string; createdAt: string } | null;
  /** Причина последнего отказа — ИИ или человека. */
  rejectionReason: string | null;
}

export type MotivationAdminReelFilter =
  | 'all'
  | 'waiting'
  | 'rejected'
  | 'appealed'
  | 'published';

/** Счётчики за сегодня для вкладки «Модерация ИИ». */
export interface MotivationAiStatsDto {
  checked: number;
  approved: number;
  rejected: number;
  escalated: number;
  errors: number;
  /** Сколько решений ИИ админ отменил — главный показатель качества порогов. */
  overridden: number;
}

export interface MotivationAdminReelsResponse {
  items: MotivationAdminReelDto[];
  stats: MotivationAiStatsDto;
}

export interface MotivationAuthorPolicyUpdate {
  dailyLimit?: number | null;
  trusted?: boolean;
  blocked?: boolean;
  note?: string | null;
}

/** Сводка сервиса за окно в днях: лента, участники, расход. */
export interface MotivationAnalyticsDto {
  days: number;
  views: number;
  likes: number;
  favorites: number;
  publishedTotal: number;
  userReels: number;
  userPublished: number;
  userRejected: number;
  editorialCostUsd: number;
  userCostUsd: number;
  top: Array<{
    id: string;
    slug: string;
    title: string;
    likeCount: number;
    origin: MotivationPostOrigin;
  }>;
}

export interface MotivationSettingsDto {
  /** Разрешено ли участникам оживлять свои рилсы в видео (это дороже картинки). */
  userVideoEnabled: boolean;
  /** Голоса, из которых выбирает автор рилса. Пусто — небольшой набор по умолчанию. */
  userVoices: MotivationVoice[];
  /** Голос, предвыбранный автору; пусто — «без озвучки». */
  userVoiceDefault: MotivationVoice | null;
  reportsToHide: number;
  /** Ежедневный автоподбор цитат ИИ воркером. Ручная кнопка «Подготовить
   *  цитаты на сегодня» этим флагом не гасится. */
  autoQuoteDiscoveryEnabled: boolean;
  userReelsEnabled: boolean;
  userDailyLimit: number;
  aiModerationMode: MotivationAiModerationMode;
  aiApproveThreshold: number;
  aiRejectThreshold: number;
  aiEditorialRules: string;
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

/**
 * Цены сверены с прайсом fal и счётом за август 2026. Ролик у нас —
 * вертикальные 5 секунд, поэтому и суммы даны за него: сравнивать «за секунду»
 * с «за миллион токенов» на глаз невозможно.
 */
export const MOTIVATION_VIDEO_MODELS: MotivationModelOption[] = [
  {
    id: 'fal-ai/bytedance/seedance/v1/pro/fast/image-to-video',
    note: '~$0.10 за 5 с в 720p ($1 за 1M токенов) — самый дешёвый',
  },
  {
    id: 'wan/v2.6/image-to-video/flash',
    note: '$0.25 за 5 с ($0.05 за секунду), плавное движение',
  },
  {
    id: 'fal-ai/bytedance/seedance/v1/pro/image-to-video',
    note: '~$0.26 за 5 с ($2.50 за 1M токенов) — качество выше fast',
  },
  {
    id: 'fal-ai/vidu/q3/image-to-video',
    note: '$0.35 за 5 с в 540p, $0.77 в 720p ($0.07 за секунду, ×2.2 за HD)',
  },
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
    note: '$0.05 за 1000 знаков — вдвое дешевле, для рилсов участников',
  },
  {
    id: 'fal-ai/minimax/speech-02-hd',
    note: '$0.10 за 1000 знаков, 300+ голосов, свои имена голосов',
  },
];

export const MOTIVATION_IMAGE_MODELS: MotivationModelOption[] = [
  { id: 'gpt-image-2', note: 'через ваш relay' },
];

/**
 * Трек генерируется один раз и переиспользуется во множестве роликов, поэтому
 * дорогая модель здесь — разовый расход. Но и он копится: минута ElevenLabs
 * стоит как восемь минут Lyria.
 */
export const MOTIVATION_MUSIC_MODELS: MotivationModelOption[] = [
  { id: 'fal-ai/lyria2', note: '$0.10 за 30 с ($0.20 за минуту) — цена/качество' },
  { id: 'cassetteai/music-generator', note: '$0.02 за минуту — заметно проще' },
  {
    id: 'fal-ai/ace-step',
    note: '$0.0002 за секунду ($0.012 за минуту) — дешевле всех, качество среднее',
  },
  {
    id: 'fal-ai/elevenlabs/music',
    note: '$0.80 за минуту, округление вверх до минуты — самая дорогая',
  },
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
  userVideoEnabled: boolean;
  userVoices: MotivationVoice[];
  userVoiceDefault: MotivationVoice | null;
  reportsToHide: number;
  autoQuoteDiscoveryEnabled: boolean;
  userReelsEnabled: boolean;
  userDailyLimit: number;
  aiModerationMode: MotivationAiModerationMode;
  aiApproveThreshold: number;
  aiRejectThreshold: number;
  aiEditorialRules: string | null;
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
export interface MotivationAdminUpdate {
  hidden?: boolean;
  category?: string;
  translations?: Partial<
    Record<MotivationLanguage, { title: string; text: string; storyText: string }>
  >;
  /**
   * Подпись: кто сказал, где и в каком месте. Правка снимает отметку о
   * проверке источника — она относилась к тому, что сверяли, а не к тому,
   * что переписали руками.
   */
  attribution?: {
    speaker?: string | null;
    work?: string | null;
    locator?: string | null;
  };
}
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

/** Живое состояние воркера Motivation: то, чего нет в базе. */
export interface MotivationWorkerHealth {
  /** Статус ioredis: `ready`, `connecting`, … или `disabled`, если REDIS_HOST не задан. */
  redis: string;
  running: boolean;
  /** Тик был не дольше срока лиза назад. Считает сервер: часы браузера не в счёт. */
  alive: boolean;
  lastTickAt: string | null;
  lastError: { at: string; message: string } | null;
}

/** Что лежит в очереди генерации прямо сейчас. */
export interface MotivationQueueCounts {
  /** Ждут изображения. */
  queued: number;
  /** Взяты воркером в работу. */
  inProgress: number;
  /** Взяты в работу и не двигались дольше срока лиза — кандидаты на восстановление. */
  stuck: number;
  failed: number;
  /** Ждут решения администратора: проверка текста или изображения. */
  awaitingReview: number;
}

export interface MotivationAdminHealth {
  worker: MotivationWorkerHealth;
  queue: MotivationQueueCounts;
}
