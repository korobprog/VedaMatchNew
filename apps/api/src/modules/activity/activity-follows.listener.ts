import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  PORTAL_ACCESS_EVENTS,
  type PortalAccessEvent,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Зеркалит `PortalAccessEvent` в `ActivityFollow` — локальную копию графа
 * «кто кому открыл видимость активности». Модуль не имеет права читать
 * таблицы Union/Contacts напрямую (контракт сервисного модуля), поэтому
 * единственный источник правды здесь — событие, а не чужая база.
 */
@Injectable()
export class ActivityFollowsListener {
  private readonly logger = new Logger(ActivityFollowsListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(PORTAL_ACCESS_EVENTS.union)
  @OnEvent(PORTAL_ACCESS_EVENTS.contacts)
  onAccess(event: PortalAccessEvent): void {
    void this.apply(event).catch((error) =>
      this.logger.error(
        'Не удалось обновить граф доступа ленты друзей',
        error instanceof Error ? error.stack : String(error),
      ),
    );
  }

  private async apply(event: PortalAccessEvent): Promise<void> {
    const occurredAt = new Date(event.occurredAt);
    if (event.granted) {
      await this.prisma.activityFollow.upsert({
        where: {
          granterId_granteeId_source: {
            granterId: event.granterId,
            granteeId: event.granteeId,
            source: event.source,
          },
        },
        create: {
          granterId: event.granterId,
          granteeId: event.granteeId,
          source: event.source,
          grantedAt: occurredAt,
        },
        update: { revokedAt: null },
      });
      return;
    }
    await this.prisma.activityFollow.updateMany({
      where: {
        granterId: event.granterId,
        granteeId: event.granteeId,
        source: event.source,
        revokedAt: null,
      },
      data: { revokedAt: occurredAt },
    });
  }
}
