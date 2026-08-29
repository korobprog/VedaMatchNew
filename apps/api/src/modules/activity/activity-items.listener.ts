import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  PORTAL_ACTIVITY_EVENTS,
  PORTAL_NOW_PLAYING_EVENT,
  resolveDisplayName,
  type ActivityAccessSource,
  type ActivityFriendSummary,
  type PortalActivityEvent,
  type PortalNowPlayingEvent,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityAvatarService } from './activity-avatar.service';
import { ActivityEventsService } from './activity-events.service';
import { buildActivityTitle, isActivityFeedAction } from './activity-copy';
import { isRecentlyOnline } from './activity-presence';

/**
 * Два канала ленты друзей, и разница между ними принципиальна.
 *
 * Постоянный: `PortalActivityEvent` зеркалится в `ActivityItem` и уходит
 * живым подписчикам SSE. Слушаются только источники, чьи действия попадают
 * в ленту (см. `ACTIVITY_FEED_ACTIONS`) — остальные события той же шины
 * (chat, astro) идут мимо, для них здесь нет подписки.
 *
 * Эфемерный: `PortalNowPlayingEvent` рассылается тем же подписчикам, но
 * **не пишется никуда**. Запись, которую человек слушает две минуты, забила
 * бы ленту за вечер сотней строк, и «сейчас» потерялось бы среди «час назад».
 */
@Injectable()
export class ActivityItemsListener {
  private readonly logger = new Logger(ActivityItemsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly avatars: ActivityAvatarService,
    private readonly events: ActivityEventsService,
  ) {}

  @OnEvent(PORTAL_ACTIVITY_EVENTS.motivation)
  @OnEvent(PORTAL_ACTIVITY_EVENTS.library)
  @OnEvent(PORTAL_ACTIVITY_EVENTS.market)
  @OnEvent(PORTAL_ACTIVITY_EVENTS.notices)
  @OnEvent(PORTAL_ACTIVITY_EVENTS.music)
  onActivity(event: PortalActivityEvent): void {
    if (!isActivityFeedAction(event.action)) return;
    void this.apply(event).catch((error) =>
      this.logger.error(
        'Не удалось записать карточку ленты друзей',
        error instanceof Error ? error.stack : String(error),
      ),
    );
  }

  private async apply(event: PortalActivityEvent): Promise<void> {
    if (!isActivityFeedAction(event.action)) return;
    const title = buildActivityTitle(event.action, event.entityLabel);
    const occurredAt = new Date(event.occurredAt);

    const item = await this.prisma.activityItem.create({
      data: {
        actorId: event.userId,
        action: event.action,
        title,
        link: event.link ?? null,
        occurredAt,
      },
      select: { id: true },
    });

    const audience = await this.audienceOf(event.userId);
    if (!audience) return;

    const itemPayload = {
      id: item.id,
      action: event.action,
      title,
      link: event.link ?? null,
      occurredAt: event.occurredAt,
    };

    for (const { friend, granteeIds } of audience) {
      this.events.publish(granteeIds, { friend, item: itemPayload });
    }
  }

  /**
   * «Слушает сейчас» — эфемерный канал.
   *
   * В `ActivityItem` не пишется намеренно: запись, которую человек слушает
   * две минуты, забила бы ленту за вечер сотней строк, и «сейчас» в ней
   * потерялось бы среди «час назад». Поэтому здесь только рассылка живым
   * подписчикам — кто не смотрит ленту в эту минуту, ничего и не пропустил.
   *
   * Рассылка живёт тут, а не в Музыке, потому что граф «кто кому открыл
   * активность» — таблица этого модуля, и читать её из чужого модуля
   * контракт запрещает. Своя копия графа в Музыке разъехалась бы с
   * оригиналом на первом же отзыве доступа.
   */
  @OnEvent(PORTAL_NOW_PLAYING_EVENT)
  onNowPlaying(event: PortalNowPlayingEvent): void {
    void this.applyNowPlaying(event).catch((error) =>
      this.logger.error(
        'Не удалось разослать «слушает сейчас»',
        error instanceof Error ? error.stack : String(error),
      ),
    );
  }

  private async applyNowPlaying(event: PortalNowPlayingEvent): Promise<void> {
    const audience = await this.audienceOf(event.userId);
    if (!audience) return;

    for (const { friend, granteeIds } of audience) {
      this.events.publish(granteeIds, {
        friend,
        nowPlaying: event.nowPlaying,
      });
    }
  }

  /**
   * Кому и от чьего имени рассылать. `null` — рассылать некому.
   *
   * Источник влияет на то, что зритель видит на значке (мэтч vs раскрытые
   * контакты), поэтому событие уходит отдельно на каждую группу зрителей со
   * своим значением `source` — см. ту же логику в `ActivityFeedService.getFeed`.
   */
  private async audienceOf(userId: string): Promise<Array<{
    friend: ActivityFriendSummary;
    granteeIds: string[];
  }> | null> {
    const follows = await this.prisma.activityFollow.findMany({
      where: { granterId: userId, revokedAt: null },
      select: { granteeId: true, source: true },
    });
    if (follows.length === 0) return null;

    const granteesBySource = new Map<ActivityAccessSource, Set<string>>();
    for (const follow of follows) {
      const set = granteesBySource.get(follow.source) ?? new Set<string>();
      set.add(follow.granteeId);
      granteesBySource.set(follow.source, set);
    }
    // Мэтч важнее для этого экрана: если один и тот же зритель попал в обе
    // группы, оставляем его только в «union».
    const unionGrantees = granteesBySource.get('union');
    const contactsGrantees = granteesBySource.get('contacts');
    if (unionGrantees && contactsGrantees) {
      for (const id of unionGrantees) contactsGrantees.delete(id);
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
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
    if (!actor) return null;

    const avatarUrl = await this.avatars.resolveAvatarUrl(actor);
    const isOnline = isRecentlyOnline(actor.lastSeenAt);

    const groups: Array<{
      friend: ActivityFriendSummary;
      granteeIds: string[];
    }> = [];
    for (const [source, granteeIds] of granteesBySource) {
      if (granteeIds.size === 0) continue;
      groups.push({
        friend: {
          id: actor.id,
          name: resolveDisplayName(actor),
          avatarUrl,
          spiritualStage: actor.spiritualStage,
          isAdmin: actor.role === 'admin' || actor.role === 'service_admin',
          source,
          isOnline,
        },
        granteeIds: [...granteeIds],
      });
    }
    return groups.length > 0 ? groups : null;
  }
}
