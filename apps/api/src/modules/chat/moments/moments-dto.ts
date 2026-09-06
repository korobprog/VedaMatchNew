import type { ChatMoment, User } from '@prisma/client';
import type {
  ChatMomentAudience,
  ChatMomentDto,
  ChatMomentRing,
} from '@vedamatch/shared';
import { toUserSummary, type ChatUserRow } from '../chat-dto';

/**
 * Сборка моментов для браузера. Отдельно от сервиса по той же причине, что и
 * `chat-dto.ts`: ошибка здесь — это либо мирское имя вместо духовного, либо
 * чужой счётчик просмотров, показанный не тому.
 */

export type ChatMomentRow = ChatMoment & { author: ChatUserRow };

export function toMomentDto(
  row: ChatMomentRow,
  viewerId: string,
  viewedByMe: boolean,
): ChatMomentDto {
  const mine = row.authorId === viewerId;
  return {
    id: row.id,
    author: toUserSummary(row.author),
    mine,
    kind: row.kind,
    caption: row.caption ?? '',
    url: row.url,
    width: row.width,
    height: row.height,
    previewUrl: row.previewUrl,
    durationSec: row.durationSec,
    background: row.background,
    audience: row.audience as ChatMomentAudience,
    // Счётчик — дело автора: кому и сколько раз показался чужой момент,
    // посторонним знать незачем.
    viewsCount: mine ? row.viewsCount : 0,
    viewedByMe,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

export function toRing(
  author: ChatUserRow,
  viewerId: string,
  moments: readonly ChatMoment[],
  seenIds: ReadonlySet<string>,
): ChatMomentRing {
  // Последний по времени — тот, чью миниатюру показывает кольцо.
  const latest = moments.reduce((newest, item) =>
    item.createdAt > newest.createdAt ? item : newest,
  );
  return {
    author: toUserSummary(author),
    mine: author.id === viewerId,
    total: moments.length,
    unseen: moments.filter((item) => !seenIds.has(item.id)).length,
    // У ролика миниатюрой идёт постер, а не он сам: качать мегабайты ради
    // кружка в полосе — это секунда ожидания на каждое открытие списка.
    previewUrl: latest.previewUrl ?? latest.url,
    previewBackground: latest.background,
    lastPublishedAt: latest.createdAt.toISOString(),
  };
}

/**
 * Снимок момента для ответа на него. Собирается на сервере из строки в базе,
 * а не из того, что прислал браузер: иначе ответом можно было бы положить в
 * чужую переписку произвольную карточку с чужой картинкой.
 */
export function momentSnapshot(
  row: ChatMomentRow,
  authorName: string,
): {
  kind: 'moment';
  title: string;
  body?: string;
  previewUrl?: string;
  key?: string;
  sourceService: string;
  sourceId: string;
} {
  return {
    kind: 'moment',
    title: `Момент · ${authorName}`,
    body: row.caption?.trim() || undefined,
    previewUrl: row.previewUrl ?? row.url ?? undefined,
    // Ключ объекта едет вместе со снимком: по нему уборщик моментов узнаёт,
    // что картинка ещё кому-то нужна, и не сносит её из-под чужого ответа.
    // У ролика это ключ постера — в переписке показывается именно он.
    key: row.previewKey ?? row.key ?? undefined,
    sourceService: 'chat.moments',
    sourceId: row.id,
  };
}

export type PrismaUserRow = Pick<
  User,
  'id' | 'name' | 'spiritualName' | 'avatarUrl'
>;
