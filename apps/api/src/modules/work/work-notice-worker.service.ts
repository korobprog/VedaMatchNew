import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { resolveDisplayName } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  WORK_EVENTS,
  type WorkTaskReturnedEvent,
  type WorkTaskStatusChangedEvent,
} from './work-events';
import { WORK_NOTICE_CLAIM_TIMEOUT_MS, resolveWorkNotice } from './work-notice';
import { workTaskKey } from './work-validate';

/**
 * Отправка дозревших уведомлений о переездах карточки.
 *
 * Устройство повторяет `MotivationWorkerService`, который CLAUDE.md называет
 * образцом фоновой стадии: тик раз в 30 секунд под Redis-лизом, клейм записи
 * через `updateMany` с проверкой, восстановление брошенного по `claimedAt`.
 * Без лиза два инстанса API отправили бы один и тот же пуш дважды.
 */
@Injectable()
export class WorkNoticeWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkNoticeWorkerService.name);
  private readonly redis: Redis | null;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    config: ConfigService,
  ) {
    const host = config.get<string>('REDIS_HOST');
    this.redis = host
      ? new Redis({
          host,
          port: Number(config.get('REDIS_PORT') || 6379),
          db: Number(config.get('REDIS_DB') || 0),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        })
      : null;
  }

  async onModuleInit(): Promise<void> {
    if (this.redis)
      await this.redis
        .connect()
        .catch((error) =>
          this.logger.warn(`Redis недоступен: ${String(error)}`),
        );
    this.timer = setInterval(() => void this.tick(), 30_000);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.redis?.status === 'ready') await this.redis.quit();
  }

  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    const token = crypto.randomUUID();
    if (this.redis?.status === 'ready') {
      const acquired = await this.redis
        .set('work:notices:lease', token, 'PX', 60_000, 'NX')
        .catch(() => null);
      if (!acquired) {
        this.running = false;
        return;
      }
    }
    try {
      await this.recoverAbandoned(now);
      const due = await this.prisma.workTaskNotice.findMany({
        where: { notifyAt: { lte: now }, claimedAt: null },
        orderBy: { notifyAt: 'asc' },
        take: 50,
        select: { id: true },
      });
      for (const { id } of due) await this.deliverOne(id, now);
    } catch (error) {
      this.logger.error(
        'Тик очереди уведомлений «Работы» не удался',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  /** Записи, взятые упавшим воркером, возвращаются в очередь. */
  private async recoverAbandoned(now: Date): Promise<void> {
    const deadline = new Date(now.getTime() - WORK_NOTICE_CLAIM_TIMEOUT_MS);
    await this.prisma.workTaskNotice.updateMany({
      where: { claimedAt: { lt: deadline } },
      data: { claimedAt: null },
    });
  }

  /**
   * Одна запись: занять, решить, слать ли, отправить и удалить.
   *
   * Запись удаляется в любом исходе, включая «не слать»: очередь хранит
   * намерение, а не историю — история переездов и так пишется в WorkActivity.
   */
  private async deliverOne(noticeId: string, now: Date): Promise<void> {
    const claimed = await this.prisma.workTaskNotice.updateMany({
      where: { id: noticeId, claimedAt: null },
      data: { claimedAt: now },
    });
    if (claimed.count === 0) return;

    try {
      const notice = await this.prisma.workTaskNotice.findUnique({
        where: { id: noticeId },
        select: {
          recipientId: true,
          fromColumnId: true,
          actor: { select: { name: true, spiritualName: true } },
          task: {
            select: {
              id: true,
              number: true,
              title: true,
              spaceId: true,
              columnId: true,
              archivedAt: true,
              space: { select: { prefix: true } },
              column: { select: { id: true, name: true, isDone: true } },
            },
          },
        },
      });
      if (!notice) return;
      const { task } = notice;
      // Задачу убрали в архив, пока уведомление дозревало: новость протухла.
      if (task.archivedAt) return;

      const from = await this.prisma.workColumn.findUnique({
        where: { id: notice.fromColumnId },
        select: { id: true, name: true, isDone: true },
      });
      // Колонку снесли вместе с доской — сказать «откуда» уже нечего.
      if (!from) return;

      // За окно человека могли исключить из среды. Уведомление о чужой теперь
      // доске — худший вид утечки: оно несёт название задачи.
      const member = await this.prisma.workSpaceMember.findFirst({
        where: { spaceId: task.spaceId, userId: notice.recipientId },
        select: { id: true },
      });
      if (!member) return;

      const outcome = resolveWorkNotice(from, task.column);
      if (outcome.kind === 'skip') return;

      const actorName = notice.actor
        ? resolveDisplayName(notice.actor)
        : 'Участник';
      const base = {
        recipientId: notice.recipientId,
        spaceId: task.spaceId,
        taskKey: workTaskKey(task.space.prefix, task.number),
        taskTitle: task.title,
        actorName,
      };

      if (outcome.kind === 'returned') {
        this.events.emit(WORK_EVENTS.taskReturned, {
          name: WORK_EVENTS.taskReturned,
          ...base,
          columnName: outcome.columnName,
        } satisfies WorkTaskReturnedEvent);
      } else {
        this.events.emit(WORK_EVENTS.taskStatusChanged, {
          name: WORK_EVENTS.taskStatusChanged,
          ...base,
          fromColumnName: outcome.fromColumnName,
          toColumnName: outcome.toColumnName,
        } satisfies WorkTaskStatusChangedEvent);
      }
    } finally {
      await this.prisma.workTaskNotice
        .delete({ where: { id: noticeId } })
        .catch(() => undefined);
    }
  }
}
