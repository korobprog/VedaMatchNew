import type { LineageId, LineagePreference } from './lineage';

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
  /**
   * Духовная линия записи. `null` — для всех линий. Преданный слышит в
   * каталоге свою линию и записи «для всех», см. `resolveContentLineage`.
   */
  lineage: LineageId | null;
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
  /**
   * Явный выбор линии на один запрос: идентификатор или `'all'`. Без него
   * сервер берёт настройку Музыки, а за ней — портальный профиль.
   */
  lineage?: LineagePreference;
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
  /** Ключ залитой обложки. `null` — снять. */
  coverKey?: string | null;
}

export type UpdateMusicArtistRequest = Partial<CreateMusicArtistRequest>;

export interface CreateMusicAlbumRequest {
  title: string;
  artistId?: string | null;
  kind?: MusicAlbumKind;
  year?: number | null;
  /** Ключ залитой обложки. `null` — снять. */
  coverKey?: string | null;
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
  /** Линия записи; `null` — для всех линий. */
  lineage?: LineageId | null;
  status?: MusicTrackStatus;
  lyrics?: string | null;
  transliteration?: string | null;
  translation?: string | null;
  /** Ключ залитой обложки. `null` — снять и вернуться к обложке альбома. */
  coverKey?: string | null;
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

// ===== Обложки =====

/**
 * Что принимаем обложкой.
 *
 * Три формата, все без анимации: обложка — это статичная картинка в сетке
 * каталога, и гифка там означала бы десяток одновременно дёргающихся плиток.
 */
export const MUSIC_COVER_ACCEPTED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type MusicCoverMime = (typeof MUSIC_COVER_ACCEPTED_MIME)[number];

/**
 * Чему принадлежит обложка. Входит в ключ объекта, поэтому выписанной под
 * плейлист ссылкой нельзя подменить обложку записи в каталоге.
 */
export type MusicCoverScope = 'track' | 'artist' | 'album' | 'playlist';

export interface CreateMusicCoverUploadRequest {
  scope: MusicCoverScope;
  mime: string;
  sizeBytes: number;
}

export interface CreateMusicCoverUploadResponse {
  /**
   * Ключ объекта. Его же надо прислать обратно в `coverKey` при сохранении
   * карточки: до этого залитый файл ничей и ни на что не влияет.
   */
  coverKey: string;
  /** Подписанный PUT. Браузер льёт картинку сюда, минуя API. */
  url: string;
  /** Заголовки, которые обязаны совпасть с подписью. */
  headers: Record<string, string>;
  expiresInSeconds: number;
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
  /**
   * Сколько из этого заняла редакция — записи без загрузившего человека.
   * Личные загрузки держит квота аккаунта, редакционные — только потолок
   * партии, поэтому их объём виден отдельной строкой.
   */
  portalBytes: number;
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

/**
 * Запись в списке «Все записи» админки.
 *
 * Отдельно от `MusicTrackDto`: витрине не нужен ни статус, ни вес файла, а
 * редакции без них нечего решать — она смотрит на список именно затем, чтобы
 * снять лишнее и освободить место. Имена исполнителя и альбома плоские: в
 * строке списка от ссылок толку нет.
 */
export interface MusicAdminTrackDto {
  id: string;
  title: string;
  status: MusicTrackStatus;
  artistName: string | null;
  albumTitle: string | null;
  durationSeconds: number;
  sizeBytes: number;
  createdAt: string;
  publishedAt: string | null;
  /**
   * Идентификаторы связей и линия — чтобы форму правки можно было
   * предзаполнить тем, что стоит сейчас. Без них админка показывала имена, но
   * при открытии правки не знала, какой пункт выбран, и любое сохранение
   * молча перевешивало запись на первый в списке.
   */
  artistId: string | null;
  albumId: string | null;
  categoryIds: string[];
  isLiveRecording: boolean;
  /** `null` — запись для всех линий. */
  lineage: LineageId | null;
}

export interface MusicAdminTracksDto {
  items: MusicAdminTrackDto[];
  /** Всего записей в каталоге — список отдаёт только первую страницу. */
  total: number;
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
  /**
   * Какую линию слушать. `null` — как в портальном профиле, `'all'` — весь
   * каталог. См. `LineagePreference`.
   */
  lineage: LineagePreference;
}

export type UpdateMusicSettingsRequest = Partial<MusicSettingsDto>;

/**
 * Сколько человек наслушал за неделю.
 *
 * Отдельным маршрутом, а не полем в состоянии плеера: сводку показывает одна
 * карточка на широком экране, и считать сумму по истории в каждом тике ради
 * неё незачем.
 */
export interface MusicListenStatsDto {
  /** Сумма прослушанного за последние семь суток, в секундах. */
  weekSeconds: number;
}

/**
 * Строка истории. Одна на прослушивание, а не на тик: подряд идущие тики
 * одной записи сливаются в неё же, и `seconds` растёт.
 */
export interface MusicListenDto {
  track: MusicTrackDto;
  seconds: number;
  listenedAt: string;
}

export interface MusicHistoryDto {
  items: MusicListenDto[];
}

// ===== Жалобы (этап 7) =====

export interface CreateMusicReportRequest {
  trackId: string;
  kind: MusicReportKind;
  text: string;
}

/**
 * Жалоба в разборе. Имя жалобщика наружу не идёт вовсе: модератор решает по
 * записи и тексту, а не по тому, кто пожаловался, — иначе разбор превращается
 * в счёт репутаций.
 */
export interface MusicAdminReportDto {
  id: string;
  kind: MusicReportKind;
  text: string;
  createdAt: string;
  track: {
    id: string;
    title: string;
    status: MusicTrackStatus;
    artistName: string | null;
  };
  /** Сколько всего открытых жалоб на эту запись. */
  openOnTrack: number;
}

export interface MusicAdminReportsDto {
  items: MusicAdminReportDto[];
}

/**
 * Решение по жалобе.
 *
 * `resolved` — жалоба справедлива, запись остаётся скрытой; `rejected` —
 * жалоба не подтвердилась, и запись возвращается в каталог. Удаления здесь
 * нет и не будет: три аккаунта не должны становиться кнопкой «удалить чужое».
 */
export interface MusicReportDecisionRequest {
  decision: 'resolved' | 'rejected';
  note?: string;
}

export interface MusicReportResultDto {
  accepted: true;
  /** Повторная жалоба от того же человека веса не добавляет. */
  alreadyReported: boolean;
  /** Скрылась ли запись прямо сейчас. */
  hidden?: boolean;
}

// ===== Плейлисты (этап 4) =====

/**
 * Плейлист человека. `totalSeconds` едет рядом со счётчиком записей: подпись
 * «14 записей · 58 мин» нужна в каждом списке, а считать её на вебе значит
 * тянуть туда длительности всех записей.
 */
export interface MusicPlaylistDto {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  visibility: MusicPlaylistVisibility;
  trackCount: number;
  totalSeconds: number;
  /** Подборка редакции: её нельзя править и удалять. */
  isSystem: boolean;
  updatedAt: string;
}

/**
 * Строка шторки «В плейлист»: плейлист плюс признак, что запись уже в нём.
 * Отдельный тип, а не флаг в общем DTO, — галочка нужна ровно на одном
 * экране, и таскать её по всем спискам незачем.
 */
export interface MusicPlaylistPickDto extends MusicPlaylistDto {
  containsTrack: boolean;
}

export interface MyMusicPlaylistsDto {
  items: MusicPlaylistDto[];
}

export interface MusicPlaylistPickerDto {
  items: MusicPlaylistPickDto[];
}

export interface CreateMusicPlaylistRequest {
  title: string;
  description?: string | null;
  visibility?: MusicPlaylistVisibility;
  /** Ключ залитой обложки. `null` — снять. */
  coverKey?: string | null;
}

export type UpdateMusicPlaylistRequest = Partial<CreateMusicPlaylistRequest>;

/**
 * Страница плейлиста.
 *
 * `canEdit` приходит с сервера, а не выводится на клиенте сравнением
 * идентификаторов: подборку портала не правит и её «владелец», и повторять
 * это правило во второй раз в браузере значит однажды их разойтись.
 */
export interface MusicPlaylistPageDto {
  playlist: MusicPlaylistDto;
  tracks: MusicTrackDto[];
  canEdit: boolean;
}

/**
 * Строка подборки портала в админке. Без видимости и `isSystem`: у подборок
 * они всегда одни и те же, и показывать их значит предлагать поменять.
 */
export interface MusicAdminPlaylistDto {
  id: string;
  title: string;
  description: string | null;
  coverKey: string | null;
  trackCount: number;
  updatedAt: string;
}

/** Перенос записи внутри плейлиста. Индекс с нуля, как его видит человек. */
export interface MoveMusicPlaylistTrackRequest {
  toIndex: number;
}

/** Ответ на добавление и снятие: интерфейс перерисовывает одну строку. */
export interface MusicPlaylistTrackResultDto {
  playlistId: string;
  trackId: string;
  containsTrack: boolean;
  trackCount: number;
}

// ===== Офлайн (этап 9) =====

/**
 * Сверка сохранённого на устройстве: клиент присылает свои идентификаторы,
 * сервер отвечает теми, что ещё разрешены.
 *
 * Именно разрешёнными, а не отозванными: тогда неизвестный сервером
 * идентификатор — мусор из старой версии, чужая ссылка — попадает в «убрать»
 * сам собой, а не живёт на устройстве вечно.
 */
export interface MusicOfflineAllowedRequest {
  ids: string[];
}

export interface MusicOfflineAllowedResponse {
  ids: string[];
}

/**
 * Подписанная ссылка на сам файл, выданная отдельным ответом.
 *
 * Плееру хватает 302 с маршрута `music/tracks/:id/stream`: `<audio src>` не
 * подчиняется CORS и спокойно ходит по редиректу. Скачиванию на устройство —
 * не хватает: `fetch` к порталу идёт с cookie (`credentials: "include"`), и
 * после редиректа то же требование переносится на бакет, а S3 никогда не
 * отвечает `Access-Control-Allow-Credentials`. Поэтому адрес берут заранее
 * этим маршрутом, а за байтами идут уже анонимно — ровно как при заливке.
 */
export interface MusicTrackStreamUrlDto {
  url: string;
  /** Сколько секунд ссылка ещё действительна. */
  expiresInSeconds: number;
}

// ===== Плейлисты друзей =====

/**
 * Чужой плейлист в списке «У друзей»: сам плейлист плюс тот, чей он.
 *
 * Владелец едет рядом, а не дочитывается отдельным запросом: список без имён
 * бесполезен, а имя портальное — его отдаёт `resolveDisplayName`.
 */
export interface MusicFriendPlaylistDto extends MusicPlaylistDto {
  owner: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

export interface MusicFriendPlaylistsDto {
  items: MusicFriendPlaylistDto[];
}

// ===== Редакционное пополнение =====

export type MusicIngestBatchStatus =
  | 'draft'
  | 'running'
  | 'ready'
  | 'published'
  | 'failed';
export type MusicIngestSource = 'upload' | 'url' | 'zip';
export type MusicIngestItemStatus =
  | 'waiting'
  | 'fetching'
  | 'stored'
  | 'skipped'
  | 'failed';

/** Партия в списке: без позиций, но с тем, что решает — объём и статус. */
export interface MusicIngestBatchDto {
  id: string;
  title: string;
  status: MusicIngestBatchStatus;
  itemCount: number;
  storedCount: number;
  failedCount: number;
  /** Сколько байт уже занято позициями этой партии. */
  sizeBytes: number;
  createdByName: string | null;
  createdAt: string;
}

/**
 * Позиция вместе с черновиком, если он уже создан: таблица показывает и
 * доставку, и метаданные, а два запроса ради одной строки не нужны.
 */
export interface MusicIngestItemDto {
  id: string;
  source: MusicIngestSource;
  sourceRef: string;
  position: number;
  status: MusicIngestItemStatus;
  failureReason: string | null;
  track: MusicTrackDto | null;
  /** Заполнен, когда позиция `skipped`: на что именно похоже. */
  duplicateOfTrackId: string | null;
}

export interface MusicIngestBatchDetailDto extends MusicIngestBatchDto {
  rightsBasis: MusicUploadRightsBasis;
  rightsNote: string | null;
  artistId: string | null;
  albumId: string | null;
  categoryIds: string[];
  language: string | null;
  isLiveRecording: boolean;
  /** Линия, которую получат записи партии; `null` — для всех линий. */
  lineage: LineageId | null;
  quotaBytes: number;
  items: MusicIngestItemDto[];
}

export interface CreateMusicIngestBatchRequest {
  title: string;
  rightsBasis: MusicUploadRightsBasis;
  rightsNote?: string;
}

export interface UpdateMusicIngestBatchRequest {
  title?: string;
  rightsBasis?: MusicUploadRightsBasis;
  rightsNote?: string | null;
  artistId?: string | null;
  albumId?: string | null;
  categoryIds?: string[];
  language?: string | null;
  isLiveRecording?: boolean;
  lineage?: LineageId | null;
}

/** Заявка на N файлов разом: браузер льёт их параллельно. */
export interface AddMusicIngestFilesRequest {
  files: { fileName: string; mime: string; sizeBytes: number }[];
}

export interface AddMusicIngestFilesResponse {
  items: {
    itemId: string;
    url: string;
    headers: Record<string, string>;
  }[];
}

/**
 * Заявка на архив. Отдаётся тем же подписанным PUT, что и обычные файлы:
 * архив идёт в бакет мимо API, а сервер потом разбирает его потоком оттуда.
 */
export interface AddMusicIngestArchiveRequest {
  fileName: string;
  sizeBytes: number;
  /** Что о типе сказал браузер. У `.zip` он в разных системах разный. */
  mime?: string;
}

/** Один подписанный PUT — на архив целиком. Позиция уже заведена. */
export interface AddMusicIngestArchiveResponse {
  itemId: string;
  url: string;
  headers: Record<string, string>;
}

export interface AddMusicIngestUrlsRequest {
  /** По адресу на строку; пустые строки отбрасываются на сервере. */
  urls: string[];
}

export interface PublishMusicIngestBatchRequest {
  /** Непусто — из партии собирается системная подборка с этим названием. */
  playlistTitle?: string;
}
