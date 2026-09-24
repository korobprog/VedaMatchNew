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
 * Вид категории каталога (VED-165). `root` — одна из двух корневых категорий
 * витрины («Традиционное», «Современное») — главный выбор, показывается не в
 * общем ряду. `style` — прежний плоский список (киртан, бхаджан, мантра…),
 * фильтр «Стиль» под заголовком.
 *
 * Корневая (VED-165-2) стоит у исполнителя (`MusicArtistDto.rootCategoryId`),
 * а не у записи: редакция проставляет её пачкой на странице исполнителей, и
 * новая запись того же исполнителя сразу попадает в нужную вкладку. Стиль —
 * по-прежнему тег на самой записи. Фильтр применяет оба измерения как
 * пересечение, не замену: «Традиционное» + «Мантра» сужает список до записей
 * исполнителя с этой корневой, у которых вдобавок стоит стиль «Мантра».
 */
export type MusicCategoryKind = 'root' | 'style';

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

/**
 * Расширения для `accept` у поля выбора файла. Одних MIME мало: файловый
 * выбор Android не знает `audio/mp4` за m4a и гасит такие файлы серым.
 */
export const MUSIC_ACCEPTED_EXTENSIONS = ['.mp3', '.m4a'] as const;

/**
 * Одни и те же форматы браузеры называют по-разному: Chrome на Android
 * отдаёт m4a как `audio/x-m4a`, старые Safari — mp3 как `audio/mp3` (VED-195).
 */
const MUSIC_MIME_ALIASES: Record<string, MusicAcceptedMime> = {
  'audio/mpeg': 'audio/mpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/x-mp3': 'audio/mpeg',
  'audio/mpeg3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
  'audio/x-mpeg-3': 'audio/mpeg',
  'audio/mpg': 'audio/mpeg',
  'audio/mp4': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/mp4a-latm': 'audio/mp4',
  'audio/x-mp4': 'audio/mp4',
};

const MUSIC_MIME_BY_EXTENSION: Record<string, MusicAcceptedMime> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
};

/**
 * Приводит заявленный браузером тип к одному из `MUSIC_ACCEPTED_MIME`.
 *
 * Синоним сводится к каноническому типу. Пустой тип и
 * `application/octet-stream` — браузер формат не узнал — решаются по
 * расширению имени файла. Всё прочее возвращается как есть (без параметров,
 * в нижнем регистре), чтобы проверка отказала по настоящему типу.
 */
export function normalizeMusicMime(
  mime: string | null | undefined,
  fileName?: string | null,
): string {
  const bare = mime?.split(';')[0]?.trim().toLowerCase() ?? '';
  const alias = MUSIC_MIME_ALIASES[bare];
  if (alias) return alias;
  if ((bare === '' || bare === 'application/octet-stream') && fileName) {
    const dot = fileName.lastIndexOf('.');
    if (dot > 0) {
      const byExtension =
        MUSIC_MIME_BY_EXTENSION[fileName.slice(dot + 1).trim().toLowerCase()];
      if (byExtension) return byExtension;
    }
  }
  return bare;
}

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
  /**
   * Корневая категория витрины — «Традиционное»/«Современное» (VED-165-2).
   * `null` — не размечен. Стоит у исполнителя, а не у записи: новая запись
   * того же исполнителя наследует её без отдельной правки, см.
   * `MusicBulkArtistRootCategoryRequest`.
   */
  rootCategoryId: string | null;
  /**
   * Чтец раздела «Аудиокниги» (VED-237): его записи — главы книг, и в общем
   * каталоге они не показываются. С VED-297 книга — отдельная единица
   * (`MusicAudiobookCardDto`), а отметка у чтеца только держит его новые
   * записи вне Медиатеки, пока редакция не разложит их по книгам.
   */
  isAudiobook: boolean;
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
  kind: MusicCategoryKind;
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
  /**
   * Сколько всего опубликованных записей видит зритель (с учётом его линии,
   * как и остальная витрина) — ответ на «а много ли тут вообще». Не сумма
   * `trackCount` категорий: запись может быть в нескольких категориях или
   * ни в одной.
   */
  totalTracks: number;
}

/**
 * Как сортировать выдачу треков. Он же список чипов ряда «Порядок» на
 * витрине: один массив на оба берега, иначе появляется чип, которого сервер
 * не знает, или порядок, до которого с витрины не дотянуться.
 *
 * `duration` здесь больше нет (VED-165): «по длительности» считалось по
 * `durationSeconds`, а у части записей эта колонка заполнена оценкой при
 * загрузке и расходится с файлом — заказчик выбрал убрать порядок, а не
 * чинить данные. Старая ссылка `?sort=duration` разбирается как незнакомое
 * значение и открывает обычную выдачу.
 */
export const MUSIC_TRACK_SORTS = ['fresh', 'popular', 'title'] as const;

export type MusicTrackSort = (typeof MUSIC_TRACK_SORTS)[number];

/**
 * Знакомый ли это порядок. Нужен обоим клиентам: страница каталога читает
 * `?sort=` из адреса и не имеет права слать дальше что попало, а разбор
 * запроса на сервере отвечает по тому же списку.
 */
export function isMusicTrackSort(value: unknown): value is MusicTrackSort {
  return MUSIC_TRACK_SORTS.includes(value as MusicTrackSort);
}

/**
 * Порядок выдачи по умолчанию — по алфавиту (VED-273).
 *
 * Раньше умолчанием было «сначала новое», и знакомое название человек искал
 * в списке, который меняет порядок от каждой новой загрузки редакции. По
 * алфавиту запись лежит там же, где лежала вчера. «Сначала новое» никуда не
 * делось — это обычный выбор в ряду «Порядок», он остаётся в адресе страницы.
 *
 * Константа в общих типах, а не в разборе запроса: витрина рисует выбранным
 * ровно тот порядок, который сервер применяет без параметра, — разъехаться
 * этим двум местам нельзя.
 */
export const MUSIC_DEFAULT_TRACK_SORT: MusicTrackSort = 'title';

export interface MusicTrackListQuery {
  q?: string;
  /**
   * Корневая категория витрины — «Традиционное»/«Современное» (VED-165).
   * Отдельный параметр рядом с `category`, а не замена: оба применяются как
   * пересечение, и старые ссылки с одним `?category=` продолжают работать —
   * `category` теперь значит «стиль».
   */
  root?: string;
  /** Стиль — прежний плоский список (киртан, бхаджан, мантра…). */
  category?: string;
  artist?: string;
  language?: string;
  /**
   * Запись с программы или студийная. Витрина этот фильтр не показывает
   * (VED-165: в панели остались только «Стиль» и «Исполнитель»), но параметр
   * API принимает — старые ссылки и другие клиенты не ломаются.
   */
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
  /**
   * Книги, которые он читает (VED-297). Необязательное: старые клиенты его
   * не ждут, и пустой список отсутствию равносилен.
   */
  audiobooks?: MusicAudiobookCardDto[];
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
  /**
   * Корневая категория (VED-165-2). `null` — снять. Сервис отказывает, если
   * категория существует, но не `kind: 'root'`.
   */
  rootCategoryId?: string | null;
  /** Исполнитель раздела «Аудиокниги» (VED-237). */
  isAudiobook?: boolean;
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
  /** Не указано — заводится как стиль, тем же умолчанием, что у схемы. */
  kind?: MusicCategoryKind;
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

/**
 * Массовая смена исполнителя у записей (VED-226). Ровно одно из
 * `artistId` / `artistName`: выбран из справочника — переносим к нему;
 * введено имя — ищем такого исполнителя без учёта регистра и, если нет,
 * заводим. `artistId: null` — снять исполнителя у всех выбранных.
 */
export interface MusicBulkTrackArtistRequest {
  trackIds: string[];
  artistId?: string | null;
  artistName?: string;
}

export interface MusicBulkTrackArtistResult {
  /** Исполнитель, к которому ушли записи; `null` — исполнитель снят. */
  artist: { id: string; name: string; slug: string } | null;
  /** Исполнитель заведён этим действием, а не найден в справочнике. */
  created: boolean;
  /** Сколько записей поменялось. */
  updated: number;
}

/**
 * Массовая простановка корневой категории исполнителям (VED-165-2). Без
 * переразметки хотя бы части каталога фильтр «Традиционное»/«Современное»
 * показывает пустой список — этим действием редакция размечает выбранных
 * исполнителей в одно нажатие, и их записи (включая будущие) попадают в
 * нужную вкладку без отдельной правки. `rootCategoryId: null` — снять
 * корневую у выбранных исполнителей.
 */
export interface MusicBulkArtistRootCategoryRequest {
  artistIds: string[];
  rootCategoryId: string | null;
}

export interface MusicBulkArtistRootCategoryResult {
  /** Сколько исполнителей поменялось. */
  updated: number;
}

/**
 * Массовая отметка «это аудиокниги» исполнителям (VED-237). Тем же приёмом,
 * что и корневая категория выше: чтец размечается один раз, все его записи —
 * и уже залитые, и будущие — уходят в раздел «Аудиокниги» и пропадают из
 * общего каталога. `isAudiobook: false` — вернуть выбранных в Медиатеку.
 */
export interface MusicBulkArtistAudiobookRequest {
  artistIds: string[];
  isAudiobook: boolean;
}

export interface MusicBulkArtistAudiobookResult {
  /** Сколько исполнителей поменялось. */
  updated: number;
}

/**
 * Разделы, устроенные как «Аудиокниги» (VED-437): цикл с частями по
 * порядку и продолжением с места. `lecture` — раздел «Лекции».
 */
export type MusicAudiobookKind = "audiobook" | "lecture";

export const MUSIC_AUDIOBOOK_KINDS: readonly MusicAudiobookKind[] = [
  "audiobook",
  "lecture",
];

/**
 * Карточка аудиокниги (VED-297) — плитка раздела «Аудиокниги» и шапка
 * страницы книги.
 *
 * Книга — самостоятельная единица, а не карточка чтеца: у одного чтеца
 * несколько книг, у одной книги — несколько начиток (это разные книги с
 * одним названием и разными чтецами).
 */
export interface MusicAudiobookCardDto {
  id: string;
  /** Раздел: «Аудиокниги» или «Лекции» (VED-437). */
  kind: MusicAudiobookKind;
  slug: string;
  title: string;
  /** Автор текста строкой; `null` — не указан. */
  author: string | null;
  /** Чтец из справочника исполнителей; `null` — не указан. */
  reader: MusicArtistRefDto | null;
  /**
   * Обложка книги, а без неё — обложка чтеца: пустой плитки в разделе быть
   * не должно.
   */
  coverUrl: string | null;
  /** Сколько опубликованных глав. */
  chapterCount: number;
  /** Суммарная длительность опубликованных глав, секунды. */
  totalSeconds: number;
}

/** Раздел «Аудиокниги»: книги по названию. Черновиков и пустых книг нет. */
export interface MusicAudiobooksDto {
  books: MusicAudiobookCardDto[];
}

/**
 * Откуда продолжать книгу. Считается по позициям, которые плеер сохраняет
 * для каждой записи (`MusicPlayState`): берётся глава, которую слушали
 * последней; дослушанная до конца — значит следующая с начала.
 */
export interface MusicAudiobookResumeDto {
  trackId: string;
  /** Номер главы с единицы — для подписи «Продолжить: глава 3». */
  chapterNumber: number;
  positionSeconds: number;
}

export interface MusicAudiobookPageDto {
  book: MusicAudiobookCardDto & { description: string | null };
  /** Опубликованные главы по порядку книги. */
  chapters: MusicTrackDto[];
  /**
   * `null` — гость, книгу ещё не начинали или дослушали до конца: тогда
   * страница предлагает слушать с начала.
   */
  resume: MusicAudiobookResumeDto | null;
}

/** Глава в редакторе книги: статус виден, чтобы черновик не терялся. */
export interface MusicAdminAudiobookChapterDto {
  trackId: string;
  title: string;
  status: MusicTrackStatus;
  durationSeconds: number;
  artistName: string | null;
}

export interface MusicAdminAudiobookDto {
  id: string;
  kind: MusicAudiobookKind;
  slug: string;
  title: string;
  author: string | null;
  description: string | null;
  readerId: string | null;
  readerName: string | null;
  coverKey: string | null;
  coverUrl: string | null;
  isPublished: boolean;
  /** Все главы по порядку, любого статуса. */
  chapters: MusicAdminAudiobookChapterDto[];
}

export interface MusicAdminAudiobooksDto {
  books: MusicAdminAudiobookDto[];
  /**
   * Записи чтецов (исполнителей с отметкой «Аудиокниги»), не разложенные ни
   * по одной книге. В Медиатеке их нет, в разделе тоже — пока редакция не
   * добавит их главами. Список, чтобы они не пропадали из виду.
   */
  unassigned: MusicAdminAudiobookChapterDto[];
}

export interface CreateMusicAudiobookRequest {
  title: string;
  /** Раздел; по умолчанию — «Аудиокниги». */
  kind?: MusicAudiobookKind;
  author?: string | null;
  description?: string | null;
  readerId?: string | null;
  /** Ключ залитой обложки. `null` — снять. */
  coverKey?: string | null;
  isPublished?: boolean;
}

export type UpdateMusicAudiobookRequest = Partial<CreateMusicAudiobookRequest>;

/**
 * Состав книги целиком, по порядку: добавить, убрать и переставить главы —
 * одно и то же действие. Запись из чужой книги сервис не заберёт молча, а
 * откажет с названием той книги.
 */
export interface SetMusicAudiobookChaptersRequest {
  trackIds: string[];
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

/**
 * Завершение заливки: файл уже в бакете, осталось создать карточку.
 *
 * `lineage` — матх или линия, которой принадлежит **запись**, а не тот, кто
 * её принёс. Поле необязательное, и это существенно: не выбрано — значит
 * `null`, «слышат все». Прежде линию подставлял сервер из профиля
 * загрузившего, и бхаджан получал чужую принадлежность молча.
 */
export interface CompleteMusicUploadRequest {
  fileName?: string;
  lineage?: LineageId | null;
  /**
   * Исполнитель из справочника (VED-114): загрузка со страницы исполнителя
   * сразу подписывает запись его именем. Принимается только от редакции
   * Музыки — участник со «своей записью» публикуется без проверки, и чужое
   * имя на ней было бы подлогом. От остальных поле молча не учитывается.
   */
  artistId?: string | null;
  /**
   * Книга, в конец которой встаёт запись главой (VED-297): загрузка со
   * страницы книги в админке. Только от редакции, как и `artistId`; без
   * `artistId` запись получает чтеца книги.
   */
  audiobookId?: string | null;
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
export type MusicCoverScope =
  | 'track'
  | 'artist'
  | 'album'
  | 'playlist'
  | 'audiobook';

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

/**
 * Разбор коллекции: исполнители по тегам уже залитых записей. Итог одного
 * прогона — и предпросмотра, и настоящего.
 */
export interface MusicArtistFromTagsGroup {
  name: string;
  /** Ключ группы: по нему редакция снимает имя с применения. */
  key: string;
  trackCount: number;
  /** Такой исполнитель в справочнике уже был — записи просто привязаны. */
  existed: boolean;
  /**
   * Сколько имён взято из названия записи («Jahnavi dasi - Maha Mantra»), а не
   * из тега. Таким веры меньше: редакция смотрит на них внимательнее.
   */
  fromTitle: number;
  /** Всего названий поменяется: имя исполнителя уходит из начала. */
  renameCount: number;
  /** Несколько примеров «было → стало» — чтобы решить, не глядя в каталог. */
  renames: Array<{ before: string; after: string }>;
  /** Имя сняли с применения: записи остались без исполнителя. */
  skipped: boolean;
}

/** Тело запроса разбора. Всё необязательно. */
export interface MusicArtistsFromTagsRequest {
  /** С какого места продолжать — `nextCursor` прошлого ответа. */
  after?: string;
  /** Ключи групп, которые не заводить и не привязывать. */
  skip?: string[];
}

export interface MusicArtistsFromTagsResult {
  /** Сколько записей без исполнителя посмотрели за прогон. */
  scanned: number;
  /** У скольких из них в теге нашлось внятное имя. */
  withTag: number;
  artistsCreated: number;
  artistsMatched: number;
  tracksLinked: number;
  /** Сколько записей без исполнителя осталось. */
  remaining: number;
  /** Сколько имён из них взято из названия, а не из тега. */
  fromTitle: number;
  /** Сколько названий поменялось (или поменяется при предпросмотре). */
  titlesRenamed: number;
  /**
   * Откуда продолжать, чтобы разобрать следующие записи; `null` — дошли до
   * конца. Без курсора прогон снова брал бы те же первые записи, у которых
   * имени нет, и дальше них не продвигался.
   */
  nextCursor: string | null;
  groups: MusicArtistFromTagsGroup[];
  /** Прогон был предпросмотром: ничего не заведено и не привязано. */
  dryRun: boolean;
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
  /** Шаг кнопки «назад» в плеере, секунды — одно из `MUSIC_SEEK_STEPS` (VED-388). */
  seekBackSeconds: number;
  /** Шаг кнопки «вперёд» в плеере, секунды — одно из `MUSIC_SEEK_STEPS`. */
  seekForwardSeconds: number;
  /**
   * Кнопки перемотки вынесены на полосу плеера. На широком экране (от
   * `lg`) они стоят там всегда, как и до VED-388: выключатель решает за
   * телефон и планшет, где места на полосе им по умолчанию нет.
   */
  playerShowSeek: boolean;
  /** Кнопка «Метка» вынесена на полосу плеера. */
  playerShowBookmark: boolean;
  /** Кнопка «История» вынесена на полосу плеера. */
  playerShowHistory: boolean;
}

export type UpdateMusicSettingsRequest = Partial<MusicSettingsDto>;

/**
 * Шаги перемотки, из которых выбирают в настройках плеера (VED-388).
 *
 * Список, а не произвольное число: ползунок от 1 до 600 секунд даёт
 * «перемотку на 37 секунд», которую никто не выбирал нарочно.
 */
export const MUSIC_SEEK_STEPS = [5, 10, 15, 30, 60] as const;
export type MusicSeekStep = (typeof MUSIC_SEEK_STEPS)[number];

/** Шаг до VED-388 — он же умолчание, чтобы ни у кого ничего не сдвинулось. */
export const MUSIC_DEFAULT_SEEK_STEP: MusicSeekStep = 15;

export function isMusicSeekStep(value: unknown): value is MusicSeekStep {
  return (
    typeof value === 'number' &&
    (MUSIC_SEEK_STEPS as readonly number[]).includes(value)
  );
}

/**
 * Метка-закладка в записи (VED-388): место, к которому человек хочет
 * вернуться, — строка лекции, начало киртана. Принадлежит человеку и записи.
 */
export interface MusicBookmarkDto {
  id: string;
  trackId: string;
  positionSeconds: number;
  /** Необязательная подпись. `null` — показываем только время. */
  label: string | null;
  createdAt: string;
}

export interface MusicBookmarksDto {
  items: MusicBookmarkDto[];
}

export interface CreateMusicBookmarkRequest {
  trackId: string;
  positionSeconds: number;
  label?: string | null;
}

export interface UpdateMusicBookmarkRequest {
  label: string | null;
}

/** Самая длинная подпись метки. Дальше это уже заметка, а не подпись. */
export const MUSIC_BOOKMARK_LABEL_MAX = 120;

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
  /**
   * Где человек остановился в этой записи (`MusicPlayState`), если не
   * дослушал: история в плеере (VED-388) ведёт туда, а не в начало.
   * `null` — позиции нет или запись дослушана.
   */
  positionSeconds?: number | null;
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

// ===== Радио VM (VED-437) =====

/** Как часто плеер радио отмечается, что его слушают, мс. */
export const MUSIC_RADIO_HEARTBEAT_MS = 20_000;
/** Сколько после последней отметки человек ещё считается слушателем, мс. */
export const MUSIC_RADIO_LISTENER_TTL_MS = 60_000;
/** Голосовая вставка: предельный размер файла. */
export const MUSIC_RADIO_INSERT_MAX_BYTES = 20 * 1024 * 1024;
/** Голосовая вставка: предельная длительность, секунды. */
export const MUSIC_RADIO_INSERT_MAX_SECONDS = 15 * 60;
/** Насколько вперёд можно отложить вставку, дни. */
export const MUSIC_RADIO_INSERT_MAX_DAYS_AHEAD = 30;
/**
 * Форматы вставки: помимо форматов каталога — то, что пишет браузер с
 * микрофона (`MediaRecorder`: WebM/Opus в Chrome, MP4 в Safari), и OGG.
 */
export const MUSIC_RADIO_INSERT_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
  "audio/wav",
] as const;

/** Что звучит в эфире: запись каталога или голосовая вставка редакции. */
export interface MusicRadioItemDto {
  slotId: string;
  kind: "track" | "insert";
  /** Начало в эфире, ISO. */
  startsAt: string;
  /** Сколько звучит в эфире, мс; вставка может оборвать запись раньше. */
  durationMs: number;
  /** Запись каталога; у вставки `null`. */
  track: MusicTrackDto | null;
  /** Название вставки; у записи `null`. */
  insertTitle: string | null;
  /** Подписанная ссылка на звук; `null` — хранилище недоступно. */
  streamUrl: string | null;
}

export interface MusicRadioStateDto {
  /** Время сервера, ISO: по нему плеер считает, с какой секунды входить. */
  serverTime: string;
  /** `null` — в каталоге нечего играть. */
  current: MusicRadioItemDto | null;
  next: MusicRadioItemDto | null;
  /** Сколько человек слушает радио прямо сейчас. */
  listeners: number;
}

/** Состояние вставки для редакции. */
export type MusicRadioInsertStatus = "scheduled" | "on_air" | "aired";

export interface MusicRadioInsertDto {
  id: string;
  title: string;
  durationSeconds: number;
  scheduledAt: string;
  status: MusicRadioInsertStatus;
  createdAt: string;
  createdByName: string | null;
}

export interface MusicRadioInsertsDto {
  inserts: MusicRadioInsertDto[];
}
