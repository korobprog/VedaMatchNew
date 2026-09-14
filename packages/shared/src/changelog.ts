// Типы публичной страницы «Версия и новости» и её admin-раздела.

export type ReleaseChangeType = 'feature' | 'fix' | 'improvement';
export type RoadmapStatus = 'planned' | 'in_progress' | 'done';
export type AnnouncementStatus = 'draft' | 'published';

/** Сколько картинок можно прикрепить к одной новости (VED-137). */
export const ANNOUNCEMENT_MAX_IMAGES = 6;

/** Картинка новости: скриншот или фото, уже сжатое сервером в webp. */
export interface AnnouncementImageDto {
  url: string;
  width: number;
  height: number;
}

// ===== Публичные DTO (уже выбранный по локали текст) =====

export interface PublicReleaseChangeDto {
  id: string;
  type: ReleaseChangeType;
  title: string;
  sortOrder: number;
}

export interface PublicReleaseDto {
  id: string;
  version: string;
  isCurrent: boolean;
  releasedAt: string;
  changes: PublicReleaseChangeDto[];
}

export interface PublicAnnouncementDto {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  /** Закреплённая новость идёт первой и показывается на главной крупно. */
  pinned: boolean;
  /** Картинки в порядке, заданном администратором; пусто — без картинок. */
  images: AnnouncementImageDto[];
  /**
   * Человек нажал «ознакомлен». Новость уходит с главной только по этой
   * отметке — сама она не пропадает. Для гостя и публичного списка всегда
   * false: отмечать нечего и некому.
   */
  acknowledged: boolean;
}

export interface PublicRoadmapItemDto {
  id: string;
  title: string;
  description: string | null;
  status: RoadmapStatus;
  sortOrder: number;
}

// ===== Admin DTO (оба языка сразу — для формы редактирования) =====

export interface AdminReleaseChangeDto {
  id: string;
  type: ReleaseChangeType;
  titleRu: string;
  titleEn: string;
  sortOrder: number;
}

export interface AdminReleaseDto {
  id: string;
  version: string;
  isCurrent: boolean;
  releasedAt: string;
  changes: AdminReleaseChangeDto[];
}

export interface AdminAnnouncementDto {
  id: string;
  titleRu: string;
  titleEn: string;
  bodyRu: string;
  bodyEn: string;
  status: AnnouncementStatus;
  publishedAt: string | null;
  pinned: boolean;
  /** Показывать не раньше; null — сразу после публикации. */
  publishAt: string | null;
  /** Убрать с главной после; null — висит, пока не снимут. */
  expiresAt: string | null;
  /** Когда рассылали и скольким: чтобы не отправить дважды вслепую. */
  broadcastAt: string | null;
  broadcastCount: number;
  /** Сколько человек нажали «ознакомлен»: копится с публикации. */
  acknowledgedCount: number;
  images: AdminAnnouncementImageDto[];
}

/** В админке у картинки есть ещё ключ в хранилище — по нему форма её и сохраняет. */
export interface AdminAnnouncementImageDto extends AnnouncementImageDto {
  key: string;
}

/**
 * Ответ загрузки картинок. Картинки ещё ни к чему не привязаны: форма
 * добавляет их к новости при сохранении. Неудачные файлы — списком, чтобы
 * одна битая картинка не отменяла остальные.
 */
export interface AnnouncementImageUploadResponse {
  images: AdminAnnouncementImageDto[];
  failed: { fileName: string; message: string }[];
}

export interface AdminRoadmapItemDto {
  id: string;
  titleRu: string;
  titleEn: string;
  descriptionRu: string | null;
  descriptionEn: string | null;
  status: RoadmapStatus;
  sortOrder: number;
}

// ===== Create/Update запросы (admin) =====

export interface AdminReleaseChangeInput {
  type: ReleaseChangeType;
  titleRu: string;
  titleEn: string;
  sortOrder?: number;
}

export interface CreateReleaseRequest {
  version: string;
  releasedAt: string;
  changes: AdminReleaseChangeInput[];
}

export interface UpdateReleaseRequest {
  version?: string;
  releasedAt?: string;
  changes?: AdminReleaseChangeInput[];
}

export interface CreateAnnouncementRequest {
  titleRu: string;
  titleEn: string;
  bodyRu: string;
  bodyEn: string;
  status?: AnnouncementStatus;
  pinned?: boolean;
  /** ISO-строка или null, чтобы снять расписание. */
  publishAt?: string | null;
  expiresAt?: string | null;
  /**
   * Картинки новости целиком, в нужном порядке. Не передано — при правке
   * картинки не трогаются; пустой список — убрать все.
   */
  images?: AnnouncementImageInput[];
}

/** Картинка, загруженная через POST /admin/changelog/announcement-images. */
export interface AnnouncementImageInput {
  key: string;
  width: number;
  height: number;
}

export type UpdateAnnouncementRequest = Partial<CreateAnnouncementRequest>;

/**
 * Кому разослать новость. Пустой список ступеней — всем участникам портала;
 * рассылка не публикует новость сама, это отдельное решение администратора.
 */
export interface BroadcastAnnouncementRequest {
  stages?: AnnouncementAudienceStage[];
}

export const ANNOUNCEMENT_AUDIENCE_STAGES = [
  'seeker',
  'practitioner',
  'yogi',
  'devotee',
] as const;

export type AnnouncementAudienceStage =
  (typeof ANNOUNCEMENT_AUDIENCE_STAGES)[number];

/** Подписи ступеней для админки: в базе они английские. */
export const ANNOUNCEMENT_AUDIENCE_LABELS: Record<
  AnnouncementAudienceStage,
  string
> = {
  seeker: 'Ищущие',
  practitioner: 'В благости',
  yogi: 'Йоги',
  devotee: 'Преданные',
};

export interface BroadcastAnnouncementResult {
  /** Скольким участникам легло уведомление в колокольчик. */
  recipients: number;
  /** Скольким ушёл push: подписка есть не у всех. */
  pushed: number;
}

export interface CreateRoadmapItemRequest {
  titleRu: string;
  titleEn: string;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  status?: RoadmapStatus;
  sortOrder?: number;
}

export type UpdateRoadmapItemRequest = Partial<CreateRoadmapItemRequest>;
