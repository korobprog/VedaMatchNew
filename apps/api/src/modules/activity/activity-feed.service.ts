import { Injectable } from '@nestjs/common';
import type {
  ActivityAccessSource,
  ActivityFeedItem,
  ActivityFeedResponse,
} from '@vedamatch/shared';
import { resolveDisplayName } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PortalAccessService } from '../access/access.service';
import { ActivityAvatarService } from './activity-avatar.service';
import { isRecentlyOnline } from './activity-presence';

/** Сколько последних карточек показывать в полосе одного друга. */
const ITEMS_PER_FRIEND = 6;
/**
 * Окно выборки по всем друзьям разом: карточек в среднем немного, а один
 * запрос вместо N+1 стоит того, что при очень активной ленте случайный друг
 * получит меньше `ITEMS_PER_FRIEND` карточек, пока не откроет свою страницу
 * (её в первой версии ещё нет — задел на потом).
 */
const ITEMS_WINDOW = 300;

interface ActivityItemRow {
  id: string;
  actorId: string;
  action: string;
  title: string;
  link: string | null;
  occurredAt: Date;
}

@Injectable()
export class ActivityFeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly avatars: ActivityAvatarService,
    private readonly access: PortalAccessService,
  ) {}

  async getFeed(viewerId: string): Promise<ActivityFeedResponse> {
    // Граф доступа читается через портальный сервис, а не отсюда: он нужен не
    // одной ленте, и второй читатель той же таблицы — это второй набор правил
    // «что считать открытым доступом».
    const follows = await this.access.grantersFor(viewerId);
    if (follows.length === 0) return { friends: [] };

    // Один и тот же человек мог открыть доступ и мэтчем, и раскрытием
    // контактов — редкое совпадение, но при нём показываем более «плотную»
    // связь: мэтч в Знакомствах важнее для этого экрана.
    const sourceByFriend = new Map<string, ActivityAccessSource>();
    for (const follow of follows) {
      const current = sourceByFriend.get(follow.granterId);
      if (!current || follow.source === 'union') {
        sourceByFriend.set(follow.granterId, follow.source);
      }
    }
    const friendIds = [...sourceByFriend.keys()];

    const items = (await this.prisma.activityItem.findMany({
      where: { actorId: { in: friendIds } },
      orderBy: { occurredAt: 'desc' },
      take: ITEMS_WINDOW,
      select: {
        id: true,
        actorId: true,
        action: true,
        title: true,
        link: true,
        occurredAt: true,
      },
    })) as ActivityItemRow[];
    if (items.length === 0) return { friends: [] };

    const grouped = new Map<string, ActivityItemRow[]>();
    for (const item of items) {
      const list = grouped.get(item.actorId) ?? [];
      // Глобально уже отсортировано по убыванию: первые попавшие в группу —
      // самые свежие.
      if (list.length < ITEMS_PER_FRIEND) list.push(item);
      grouped.set(item.actorId, list);
    }

    const actorIds = [...grouped.keys()];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: {
        id: true,
        name: true,
        spiritualName: true,
        avatarUrl: true,
        avatarKey: true,
        spiritualStage: true,
        role: true,
        lastSeenAt: true,
      },
    });
    const actorById = new Map(actors.map((a) => [a.id, a]));
    const now = new Date();

    const rows: ActivityFeedResponse['friends'] = [];
    for (const actorId of actorIds) {
      const actor = actorById.get(actorId);
      // Аккаунт удалён — каскад ещё не дошёл до ActivityItem либо дойдёт
      // с задержкой; строку в ленте такому автору не показываем.
      if (!actor) continue;
      const friendItems = grouped.get(actorId)!;
      rows.push({
        friend: {
          id: actor.id,
          name: resolveDisplayName(actor),
          avatarUrl: await this.avatars.resolveAvatarUrl(actor),
          spiritualStage: actor.spiritualStage,
          isAdmin: actor.role === 'admin' || actor.role === 'service_admin',
          source: sourceByFriend.get(actorId) ?? 'contacts',
          isOnline: isRecentlyOnline(actor.lastSeenAt, now),
        },
        items: friendItems.map(toFeedItem),
        lastActivityAt: friendItems[0].occurredAt.toISOString(),
      });
    }

    rows.sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1));
    return { friends: rows };
  }
}

function toFeedItem(row: ActivityItemRow): ActivityFeedItem {
  return {
    id: row.id,
    action: row.action as ActivityFeedItem['action'],
    title: row.title,
    link: row.link,
    occurredAt: row.occurredAt.toISOString(),
  };
}
