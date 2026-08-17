import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  CreateNoticeSubscriptionRequest,
  NoticeSubscriptionDto,
  NoticeSubscriptionsResponse,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { subscriptionTargetKey } from './subscription-target-key';

/** Сколько подписчиков оповещаем на одну публикацию за раз. */
const MAX_RECIPIENTS = 500;

@Injectable()
export class NoticesSubscriptionsService {
  private readonly logger = new Logger(NoticesSubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async list(userId: string): Promise<NoticeSubscriptionsResponse> {
    const rows = await this.prisma.noticeSubscription.findMany({
      where: { userId },
      include: { rubric: true, community: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        targetKey: row.targetKey,
        title:
          row.rubric?.nameRu ??
          row.community?.name ??
          row.city ??
          row.targetKey,
        city: row.city,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async subscribe(
    userId: string,
    body: CreateNoticeSubscriptionRequest,
  ): Promise<NoticeSubscriptionDto> {
    const city = body.city?.trim() || null;
    const rubric = body.rubricSlug
      ? await this.prisma.noticeRubric.findUnique({
          where: { slug: body.rubricSlug },
        })
      : null;
    if (body.rubricSlug && !rubric)
      throw new BadRequestException('Рубрика не найдена');
    if (body.kind === 'rubric' && !rubric)
      throw new BadRequestException('Выберите рубрику');
    if (body.kind === 'city' && !city)
      throw new BadRequestException('Укажите город');
    if (body.kind === 'community' && !body.communityId)
      throw new BadRequestException('Выберите общину');

    const targetKey = subscriptionTargetKey({
      kind: body.kind,
      rubricSlug: rubric?.slug ?? null,
      city,
      communityId: body.communityId ?? null,
    });

    const row = await this.prisma.noticeSubscription.upsert({
      where: { userId_targetKey: { userId, targetKey } },
      update: {},
      create: {
        userId,
        kind: body.kind,
        targetKey,
        rubricId: rubric?.id ?? null,
        city,
        communityId: body.communityId ?? null,
      },
      include: { rubric: true, community: { select: { name: true } } },
    });
    return {
      id: row.id,
      kind: row.kind,
      targetKey: row.targetKey,
      title:
        row.rubric?.nameRu ?? row.community?.name ?? row.city ?? row.targetKey,
      city: row.city,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async unsubscribe(userId: string, id: string): Promise<void> {
    // deleteMany, а не delete: чужой id должен молча ничего не удалить,
    // а не сказать «не найдено» — это подтверждало бы существование.
    await this.prisma.noticeSubscription.deleteMany({ where: { id, userId } });
  }

  /**
   * Рассылка по факту публикации.
   *
   * Событие самодостаточно: подписчик (модуль уведомлений) не читает наши
   * таблицы, а формулировку пишет сам — контракт, «тексты, видимые
   * пользователю».
   *
   * Автор себе не пишет: он и так знает, что опубликовал.
   */
  async notifyPublished(notice: {
    id: string;
    title: string;
    rubricSlug: string;
    rubricName: string;
    city: string | null;
    communityId: string | null;
    communityName: string | null;
    authorId: string;
    audience: string;
  }): Promise<number> {
    // Закрытое объявление рассылать нельзя: подписчик рубрики может не
    // состоять в общине, и уведомление показало бы ему то, чего он не увидит.
    if (notice.audience !== 'everyone') return 0;

    const keys = [
      subscriptionTargetKey({
        kind: 'rubric',
        rubricSlug: notice.rubricSlug,
        city: null,
        communityId: null,
      }),
      ...(notice.city
        ? [
            subscriptionTargetKey({
              kind: 'city',
              rubricSlug: null,
              city: notice.city,
              communityId: null,
            }),
          ]
        : []),
      ...(notice.communityId
        ? [
            subscriptionTargetKey({
              kind: 'community',
              rubricSlug: null,
              city: null,
              communityId: notice.communityId,
            }),
          ]
        : []),
    ];

    const rows = await this.prisma.noticeSubscription.findMany({
      where: { targetKey: { in: keys }, userId: { not: notice.authorId } },
      select: { userId: true, kind: true, city: true },
      take: MAX_RECIPIENTS,
    });

    // Один человек мог подписаться и на рубрику, и на город: уведомление
    // должно уйти один раз.
    const seen = new Set<string>();
    let sent = 0;
    for (const row of rows) {
      if (seen.has(row.userId)) continue;
      seen.add(row.userId);
      this.events.emit('notices.notice.published', {
        name: 'notices.notice.published',
        recipientId: row.userId,
        sourceName:
          row.kind === 'rubric'
            ? notice.rubricName
            : row.kind === 'city'
              ? (row.city ?? notice.city ?? 'Ваш город')
              : (notice.communityName ?? 'Ваша община'),
        noticeTitle: notice.title,
        noticeId: notice.id,
      });
      sent += 1;
    }
    if (sent > 0)
      this.logger.log(`Объявление ${notice.id}: оповещено подписчиков ${sent}`);
    return sent;
  }
}
