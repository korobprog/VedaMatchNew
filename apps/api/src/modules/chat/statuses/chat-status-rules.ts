import {
  CHAT_STATUS_IMAGE_MAX_BYTES,
  CHAT_STATUS_IMAGE_MIME_TYPES,
  CHAT_STATUS_TEXT_MAX,
  CHAT_STATUS_TTL_HOURS,
  CHAT_STATUS_VIDEO_MAX_BYTES,
  CHAT_STATUS_VIDEO_MAX_SECONDS,
  CHAT_STATUS_VIDEO_MIME_TYPES,
  type ChatStatusAuthorDto,
  type ChatStatusDto,
  type ChatStatusFeedResponse,
  type ChatStatusMediaKind,
  type ChatStatusRing,
  type ChatUserSummary,
} from '@vedamatch/shared';

/**
 * Статусы (VED-129) — чистая часть: что принимается, сколько живёт и как
 * из строк базы собираются лента и кружки вокруг аватарок. Сервис вокруг
 * только ходит в базу и хранилище.
 */

export function statusMediaKindFor(
  mimetype: string,
): ChatStatusMediaKind | null {
  if ((CHAT_STATUS_IMAGE_MIME_TYPES as readonly string[]).includes(mimetype))
    return 'photo';
  if ((CHAT_STATUS_VIDEO_MIME_TYPES as readonly string[]).includes(mimetype))
    return 'video';
  return null;
}

/** Почему файл не годится; `null` — годится. */
export function statusUploadDenial(file: {
  mimetype: string;
  size: number;
}): string | null {
  const kind = statusMediaKindFor(file.mimetype);
  if (!kind)
    return 'В статус можно приложить фото (JPEG, PNG, WebP) или видео (MP4, WebM)';
  const max =
    kind === 'photo'
      ? CHAT_STATUS_IMAGE_MAX_BYTES
      : CHAT_STATUS_VIDEO_MAX_BYTES;
  if (file.size > max)
    return kind === 'photo' ? 'Фото больше 10 МБ' : 'Видео больше 50 МБ';
  return null;
}

/** Длительность ролика; `null` — годится. */
export function statusVideoDurationDenial(
  durationSec: number | null,
): string | null {
  if (durationSec === null) return 'Не удалось прочитать видео';
  if (durationSec > CHAT_STATUS_VIDEO_MAX_SECONDS)
    return `Видео длиннее ${CHAT_STATUS_VIDEO_MAX_SECONDS} секунд`;
  return null;
}

/**
 * Текст статуса: обрезанный, пустой — `null`. Пустой статус без файла не
 * бывает: публиковать нечего.
 */
export function statusText(
  raw: unknown,
  hasMedia: boolean,
): { text: string | null } | { denial: string } {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text.length > CHAT_STATUS_TEXT_MAX)
    return { denial: `Текст статуса длиннее ${CHAT_STATUS_TEXT_MAX} знаков` };
  if (!text && !hasMedia)
    return { denial: 'Напишите текст или приложите фото или видео' };
  return { text: text || null };
}

export function statusExpiresAt(now: Date): Date {
  return new Date(now.getTime() + CHAT_STATUS_TTL_HOURS * 3_600_000);
}

export interface StatusRow {
  id: string;
  authorId: string;
  text: string | null;
  mediaKind: ChatStatusMediaKind | null;
  mediaUrl: string | null;
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  createdAt: Date;
  expiresAt: Date;
  /** Смотрящий открывал этот статус. */
  viewedByViewer: boolean;
  /** Сколько человек открыли — нужно только автору. */
  viewCount: number;
}

export function toStatusDto(row: StatusRow, viewerId: string): ChatStatusDto {
  const own = row.authorId === viewerId;
  return {
    id: row.id,
    text: row.text,
    media:
      row.mediaKind && row.mediaUrl
        ? {
            kind: row.mediaKind,
            url: row.mediaUrl,
            posterUrl: row.posterUrl,
            width: row.width,
            height: row.height,
            durationSec: row.durationSec,
          }
        : null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    viewed: own || row.viewedByViewer,
    viewCount: own ? row.viewCount : null,
  };
}

/**
 * Лента: статусы по авторам в порядке публикации. Свои — отдельно. Чужие
 * авторы — сначала те, у кого есть непросмотренное, внутри — у кого статус
 * свежее, тот выше: так устроены WhatsApp и Telegram.
 */
export function buildStatusFeed(
  rows: readonly StatusRow[],
  users: ReadonlyMap<string, ChatUserSummary>,
  viewerId: string,
): ChatStatusFeedResponse {
  const byAuthor = new Map<string, StatusRow[]>();
  for (const row of rows) {
    if (!users.has(row.authorId)) continue;
    const list = byAuthor.get(row.authorId) ?? [];
    list.push(row);
    byAuthor.set(row.authorId, list);
  }

  let mine: ChatStatusAuthorDto | null = null;
  const others: { dto: ChatStatusAuthorDto; latest: number }[] = [];
  for (const [authorId, list] of byAuthor) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const statuses = list.map((row) => toStatusDto(row, viewerId));
    const dto: ChatStatusAuthorDto = {
      user: users.get(authorId)!,
      statuses,
      unseen: statuses.filter((status) => !status.viewed).length,
    };
    if (authorId === viewerId) mine = dto;
    else
      others.push({
        dto,
        latest: list[list.length - 1].createdAt.getTime(),
      });
  }

  others.sort(
    (a, b) =>
      Number(b.dto.unseen > 0) - Number(a.dto.unseen > 0) ||
      b.latest - a.latest,
  );
  return { mine, others: others.map((entry) => entry.dto) };
}

/** Кружки для аватарок: по автору — сколько секций и сколько зелёных. */
export function statusRings(
  rows: readonly Pick<StatusRow, 'authorId' | 'viewedByViewer'>[],
  viewerId: string,
): Record<string, ChatStatusRing> {
  const rings: Record<string, ChatStatusRing> = {};
  for (const row of rows) {
    const ring = (rings[row.authorId] ??= { total: 0, unseen: 0 });
    ring.total += 1;
    if (row.authorId !== viewerId && !row.viewedByViewer) ring.unseen += 1;
  }
  return rings;
}
