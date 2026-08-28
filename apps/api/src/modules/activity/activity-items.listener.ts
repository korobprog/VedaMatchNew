import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  PORTAL_ACTIVITY_EVENTS,
  resolveDisplayName,
  type ActivityAccessSource,
  type PortalActivityEvent,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityAvatarService } from './activity-avatar.service';
import { ActivityEventsService } from './activity-events.service';
import { buildActivityTitle, isActivityFeedAction } from './activity-copy';
import { isRecentlyOnline } from './activity-presence';

/**
 * Зеркалит `PortalActivityEvent` в `ActivityItem` и толкает карточку живым
 * подписчикам SSE. Слушает только источники, чьи действия попадают в ленту
 * друзей (см. `ACTIVITY_FEED_ACTIONS`) — остальные события той же шины
 * (chat, notices, astro) идут мимо, для них здесь нет подписки.
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

    const follows = await this.prisma.activityFollow.findMany({
      where: { granterId: event.userId, revokedAt: null },
      select: { granteeId: true, source: true },
    });
    if (follows.length === 0) return;

    // Источник влияет на то, что зритель видит на значке (мэтч vs
    // раскрытые контакты), поэтому карточка рассылается отдельно на каждую
    // группу зрителей с их собственным значением `source` — см. ту же
    // логику в `ActivityFeedService.getFeed`.
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
      where: { id: event.userId },
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
    if (!actor) return;

    const avatarUrl = await this.avatars.resolveAvatarUrl(actor);
    const isOnline = isRecentlyOnline(actor.lastSeenAt);
    const itemPayload = {
      id: item.id,
      action: event.action,
      title,
      link: event.link ?? null,
      occurredAt: event.occurredAt,
    };

    for (const [source, granteeIds] of granteesBySource) {
      if (granteeIds.size === 0) continue;
      this.events.publish([...granteeIds], {
        friend: {
          id: actor.id,
          name: resolveDisplayName(actor),
          avatarUrl,
          spiritualStage: actor.spiritualStage,
          isAdmin: actor.role === 'admin' || actor.role === 'service_admin',
          source,
          isOnline,
        },
        item: itemPayload,
      });
    }
  }
}
