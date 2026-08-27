// Типы сервиса «Музыка». См. docs/music-service-plan.md.
//
// Единица сервиса — запись, которую слушают: киртан, бхаджан, мантра,
// программа. Если здесь заводится лента с бесконечной прокруткой и лайками
// под каждым треком — сервис уехал во «Вдохновение»; если появляются лекции
// без музыки, разложенные по курсам, — это Образование.
//
// Имя `MusicTrack*` не имеет отношения к `MotivationTrack` в схеме: там
// сгенерённая нейросетью подложка под рилсы чужого сервиса.

/** Кто исполняет. `unknown` — честный ответ для записей, где на плёнке не назвались. */
export type MusicArtistKind = 'kirtaneer' | 'group' | 'temple' | 'unknown';

export type MusicAlbumKind = 'album' | 'live' | 'compilation' | 'single';

/**
 * Состояние записи в каталоге. `pending` — загрузка обычного человека до
 * разбора модератором, слышит её только он сам; `hidden` снимает запись с
 * витрины, не удаляя файл.
 */
export type MusicTrackStatus =
  | 'draft'
  | 'pending'
  | 'published'
  | 'rejected'
  | 'hidden';

/** `friends` — те, кому уже открыта активность портала. */
export type MusicPlaylistVisibility = 'private' | 'friends' | 'public';

export type MusicNowPlayingVisibility = 'friends' | 'nobody';

/** `pending` здесь — «подписанный PUT выдан, файла ещё нет», а не «ждёт модерации». */
export type MusicUploadStatus = 'pending' | 'completed' | 'failed' | 'expired';

/** Основание, на котором человек заливает запись; без него загрузка недоступна. */
export type MusicUploadRightsBasis =
  | 'own_recording'
  | 'open_program'
  | 'freely_distributed';

export type MusicReportKind = 'copyright' | 'content' | 'quality';

export type MusicReportStatus = 'open' | 'resolved' | 'rejected';

/**
 * Форматы, которые сервис принимает в v1. `flac`, `wav` и `ogg` отклоняются
 * на валидации: без транскодирования они играют не везде, а транскодирование
 * — отдельный воркер и отдельный деплой.
 */
export const MUSIC_ACCEPTED_MIME = ['audio/mpeg', 'audio/mp4'] as const;

export type MusicAcceptedMime = (typeof MUSIC_ACCEPTED_MIME)[number];

/** Сколько живёт подписанная ссылка на аудио. Файлы в бакете не публичные. */
export const MUSIC_STREAM_URL_TTL_SECONDS = 6 * 60 * 60;

export interface MusicArtistDto {
  id: string;
  slug: string;
  name: string;
  kind: MusicArtistKind;
  bio: string | null;
  coverUrl: string | null;
  isVerified: boolean;
  trackCount: number;
}

export interface MusicAlbumDto {
  id: string;
  slug: string;
  title: string;
  kind: MusicAlbumKind;
  year: number | null;
  coverUrl: string | null;
  artist: MusicArtistRefDto | null;
  trackCount: number;
}

/** Короткая ссылка на исполнителя внутри карточки трека или альбома. */
export interface MusicArtistRefDto {
  id: string;
  slug: string;
  name: string;
}

export interface MusicCategoryDto {
  id: string;
  slug: string;
  title: string;
  position: number;
  trackCount: number;
}

/**
 * Карточка записи наружу. `storageKey` здесь нет намеренно: ключ в бакете
 * — внутренняя деталь, наружу уходит только подписанная ссылка из
 * `music/tracks/:id/stream`.
 */
export interface MusicTrackDto {
  id: string;
  title: string;
  artist: MusicArtistRefDto | null;
  album: MusicAlbumRefDto | null;
  categories: MusicCategoryRefDto[];
  durationSeconds: number;
  coverUrl: string | null;
  language: string | null;
  /** Значок «Запись с программы» на карточке рядом с чипом категории. */
  isLiveRecording: boolean;
  playCount: number;
  publishedAt: string | null;
}

export interface MusicAlbumRefDto {
  id: string;
  slug: string;
  title: string;
}

export interface MusicCategoryRefDto {
  id: string;
  slug: string;
  title: string;
}

/** Тексты бхаджана. Показываются с этапа 9, поля в модели заведены сразу. */
export interface MusicTrackLyricsDto {
  lyrics: string | null;
  transliteration: string | null;
  translation: string | null;
}

export interface MusicTrackDetailDto extends MusicTrackDto {
  lyrics: MusicTrackLyricsDto;
  status: MusicTrackStatus;
  sizeBytes: number;
  bitrateKbps: number | null;
  /** Решение модератора словами. Пусто — решения ещё не было. */
  moderationNote: string | null;
}

/** Плитка подборки портала в витрине («Утренний киртан», «Вечерняя арати»). */
export interface MusicPlaylistCardDto {
  id: string;
  title: string;
  coverUrl: string | null;
  trackCount: number;
  /** Суммарная длительность, секунды. Нужна подписи «14 записей · 58 мин». */
  totalSeconds: number;
}

/**
 * Витрина `/music`. Одним запросом, а не четырьмя: страница целиком
 * бесполезна, пока не приехала последняя секция, и четыре спиннера вместо
 * одного экрана — худшее из обоих миров.
 */
export interface MusicCatalogDto {
  categories: MusicCategoryDto[];
  fresh: MusicTrackDto[];
  artists: MusicArtistDto[];
  systemPlaylists: MusicPlaylistCardDto[];
}

/** Как сортировать выдачу треков. */
export type MusicTrackSort = 'fresh' | 'popular' | 'title' | 'duration';

/**
 * Длительность корзинами, а не парой чисел: человек ищет «что-нибудь на
 * дорогу», а не запись от 900 до 1800 секунд.
 */
export type MusicDurationBucket = 'short' | 'medium' | 'long';

export interface MusicTrackListQuery {
  q?: string;
  category?: string;
  artist?: string;
  language?: string;
  duration?: MusicDurationBucket;
  live?: boolean;
  sort?: MusicTrackSort;
  cursor?: string;
  limit?: number;
}

export interface MusicTrackListDto {
  items: MusicTrackDto[];
  /** `null` — записей больше нет. */
  nextCursor: string | null;
}

export interface MusicArtistPageDto {
  artist: MusicArtistDto;
  albums: MusicAlbumDto[];
  tracks: MusicTrackDto[];
}

export interface MusicAlbumPageDto {
  album: MusicAlbumDto;
  tracks: MusicTrackDto[];
}

export interface CreateMusicArtistRequest {
  name: string;
  kind?: MusicArtistKind;
  bio?: string | null;
  isVerified?: boolean;
}

export type UpdateMusicArtistRequest = Partial<CreateMusicArtistRequest>;

export interface CreateMusicAlbumRequest {
  title: string;
  artistId?: string | null;
  kind?: MusicAlbumKind;
  year?: number | null;
}

export type UpdateMusicAlbumRequest = Partial<CreateMusicAlbumRequest>;

export interface CreateMusicCategoryRequest {
  title: string;
  titleEn?: string | null;
  position?: number;
}

export type UpdateMusicCategoryRequest = Partial<CreateMusicCategoryRequest>;

/**
 * Правка метаданных записи админом. Файла здесь нет: он приезжает загрузкой
 * (этап 2), и подменить его правкой карточки нельзя.
 */
export interface UpdateMusicTrackRequest {
  title?: string;
  artistId?: string | null;
  albumId?: string | null;
  categoryIds?: string[];
  language?: string | null;
  isLiveRecording?: boolean;
  status?: MusicTrackStatus;
  lyrics?: string | null;
  transliteration?: string | null;
  translation?: string | null;
}

// ===== Загрузка (этап 2) =====

/**
 * Заявка на загрузку. Размер и тип присылает браузер — им не верят, но они
 * нужны заранее: подписанный PUT выписывается ровно под них, и залить по
 * этой ссылке что-то другое уже не выйдет.
 */
export interface CreateMusicUploadRequest {
  fileName: string;
  mime: string;
  sizeBytes: number;
  rightsBasis: MusicUploadRightsBasis;
}

export interface CreateMusicUploadResponse {
  uploadId: string;
  /** Подписанный PUT. Браузер льёт файл сюда, минуя API. */
  url: string;
  /** Заголовки, которые обязаны совпасть с подписью. */
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export interface CompleteMusicUploadResponse {
  trackId: string;
  status: MusicTrackStatus;
  title: string;
  durationSeconds: number;
}

/** Сколько места занято и сколько всего разрешено. */
export interface MusicStorageUsageDto {
  usedBytes: number;
  quotaBytes: number;
  maxUploadBytes: number;
  acceptedMime: string[];
}

// ===== Админка =====

/** Строка очереди модерации: запись плюс то, что нужно решить по ней. */
export interface MusicModerationItemDto {
  track: MusicTrackDetailDto;
  /** Кто залил. В админке — мирское имя, как во всех разделах модерации. */
  uploader: { id: string; name: string } | null;
  rightsBasis: MusicUploadRightsBasis | null;
  uploadedAt: string | null;
}

export interface MusicAdminSummaryDto {
  pending: number;
  published: number;
  hidden: number;
  artists: number;
  albums: number;
  categories: number;
  openReports: number;
  /** Занято в бакете опубликованным и ждущим, байты. */
  storedBytes: number;
}

/** Решение по записи из очереди. */
export interface MusicModerationDecisionRequest {
  decision: 'publish' | 'reject' | 'hide';
  /** Причина. Обязательна для отказа и скрытия — человеку её покажут. */
  note?: string;
}

export interface MusicAdminArtistsDto {
  items: MusicArtistDto[];
}

export interface MusicAdminAlbumsDto {
  items: MusicAlbumDto[];
}

export interface MusicAdminCategoriesDto {
  items: MusicCategoryDto[];
}

// ===== Свои загрузки (этап 7) =====

/**
 * Своя запись глазами того, кто её залил. Здесь, в отличие от каталога,
 * видны статус и решение модератора: «отклонено» без причины гарантирует
 * повторную заливку того же файла.
 */
export interface MyMusicUploadDto {
  trackId: string;
  title: string;
  status: MusicTrackStatus;
  durationSeconds: number;
  sizeBytes: number;
  moderationNote: string | null;
  createdAt: string;
  publishedAt: string | null;
  /** Можно ли снять её самому. Опубликованную — нет, она уже в каталоге. */
  canDelete: boolean;
}

export interface MyMusicUploadsDto {
  items: MyMusicUploadDto[];
  usage: MusicStorageUsageDto;
}

// ===== Плеер (этап 3) =====

/**
 * Повтор очереди. Тот же набор, что в `music-queue.ts` на обеих сторонах —
 * оттуда он и импортируется, чтобы не разъехаться.
 */
export type MusicRepeatMode = 'off' | 'all' | 'one';

/**
 * Состояние плеера, переживающее переход между устройствами.
 *
 * Очередь — идентификаторами, а не карточками: страница дочитает их сама, а
 * гонять полсотни DTO в каждом heartbeat незачем.
 */
export interface MusicPlaybackStateDto {
  trackId: string | null;
  positionSeconds: number;
  queue: string[];
  repeat: MusicRepeatMode;
  shuffle: boolean;
  updatedAt: string | null;
}

export interface UpdateMusicPlaybackStateRequest {
  trackId: string | null;
  positionSeconds?: number;
  queue?: string[];
  repeat?: MusicRepeatMode;
  shuffle?: boolean;
}

/**
 * Тик плеера, раз в 30 секунд. `listenedSeconds` — сколько реально
 * прослушано с прошлого тика, а не разница позиций: перемотка не должна
 * засчитываться как прослушивание.
 */
export interface MusicHeartbeatRequest {
  trackId: string;
  positionSeconds: number;
  listenedSeconds: number;
  isPrivateSession: boolean;
}

export interface MusicSettingsDto {
  nowPlayingVisibility: MusicNowPlayingVisibility;
  autoplay: boolean;
}

export type UpdateMusicSettingsRequest = Partial<MusicSettingsDto>;

// ===== Жалобы (этап 7) =====

export interface CreateMusicReportRequest {
  trackId: string;
  kind: MusicReportKind;
  text: string;
}

export interface MusicReportResultDto {
  accepted: true;
  /** Повторная жалоба от того же человека веса не добавляет. */
  alreadyReported: boolean;
  /** Скрылась ли запись прямо сейчас. */
  hidden?: boolean;
}
