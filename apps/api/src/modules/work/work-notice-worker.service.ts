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
  type WorkTaskCommentedEvent,
  type WorkTaskReturnedEvent,
  type WorkTaskStatusChangedEvent,
} from './work-events';
import { WORK_NOTICE_CLAIM_TIMEOUT_MS, resolveWorkNotice } from './work-notice';
import { resolveTaskStatusMark } from './work-task-status';
import { workTaskKey } from './work-validate';

/**
 * На сколько активность может опережать саму строку очереди: пишется она
 * перед постановкой, и пара секунд гонки не должна ломать сверку.
 */
const ACTIVITY_SLACK_MS = 60_000;

/** Строка очереди ровно в том объёме, в котором её решает отправлять воркер. */
type DeliverableNotice = {
  id: string;
  recipientId: string;
  actorId: string | null;
  createdAt: Date;
  notifyAt: Date;
  actor: { isAgent: boolean } | null;
  task: { id: string; assigneeId: string | null; createdById: string | null };
};

/**
 * Отправка дозревших уведомлений о работе с карточкой.
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
   * Причина не слать уже занятую запись (VED-507). `null` — слать.
   *
   * Получатель в строке заморожен в момент постановки, а между постановкой и
   * отправкой проходит окно дозревания. Воркер — последний рубеж: он дочитывает
   * задачу заново и сверяет, что человек всё ещё тот, кому новость положена.
   */
  private async staleReason(notice: DeliverableNotice): Promise<string | null> {
    const owner = notice.task.assigneeId ?? notice.task.createdById;
    if (!owner || owner !== notice.recipientId) {
      return 'получатель больше не владеет задачей';
    }
    if (notice.actorId && notice.recipientId === notice.actorId) {
      return 'строка адресована самому действовавшему';
    }
    if (notice.actor?.isAgent && (await this.actedForRecipient(notice))) {
      return 'задачей распоряжался агент от имени получателя';
    }
    return null;
  }

  /**
   * Действовал ли актор этой строки внутри её окна от имени получателя.
   *
   * `onBehalfOf` в строке очереди не лежит — там только актор, которым при
   * агентском ключе служебный аккаунт, — поэтому человека восстанавливаем из
   * истории: поручение и комментарий пишутся в WorkActivity тем же актором и с
   * тем же `onBehalfOf`, что и кладутся в очередь. Окно ограничиваем сроком
   * самой строки: более старая запись относится к прошлому окну, которое уже
   * отправлено.
   */
  private async actedForRecipient(notice: DeliverableNotice): Promise<boolean> {
    if (!notice.actorId) return false;
    const activity = await this.prisma.workActivity.findFirst({
      where: {
        taskId: notice.task.id,
        actorId: notice.actorId,
        onBehalfOfId: notice.recipientId,
        createdAt: {
          gte: new Date(notice.createdAt.getTime() - ACTIVITY_SLACK_MS),
          lte: notice.notifyAt,
        },
      },
      select: { id: true },
    });
    return activity !== null;
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
          id: true,
          recipientId: true,
          actorId: true,
          fromColumnId: true,
          commentBody: true,
          commentCount: true,
          createdAt: true,
          notifyAt: true,
          actor: { select: { name: true, spiritualName: true, isAgent: true } },
          task: {
            select: {
              id: true,
              number: true,
              title: true,
              spaceId: true,
              columnId: true,
              archivedAt: true,
              assigneeId: true,
              createdById: true,
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

      // Получатель заморожен в момент постановки (VED-507), а живёт строка
      // три минуты — за это время задачу успевают поручить другому. Строку на
      // бывшего исполнителя не слать: это ровно та вспышка, на которую жалуется
      // заказчик.
      const stale = await this.staleReason(notice);
      if (stale) {
        this.logger.log(
          `Уведомление ${noticeId} не отправлено: ${stale} (VED-507)`,
        );
        return;
      }

      // Колонку могли снести вместе с доской — тогда сказать «откуда» нечего
      // и переезд из окна выпадает. Комментарий из того же окна при этом
      // остаётся новостью, поэтому здесь `null`, а не выход.
      const from = notice.fromColumnId
        ? await this.prisma.workColumn.findUnique({
            where: { id: notice.fromColumnId },
            select: { id: true, name: true, isDone: true },
          })
        : null;

      // За окно человека могли исключить из среды. Уведомление о чужой теперь
      // доске — худший вид утечки: оно несёт название задачи.
      const member = await this.prisma.workSpaceMember.findFirst({
        where: { spaceId: task.spaceId, userId: notice.recipientId },
        select: { id: true },
      });
      if (!member) return;

      const outcome = resolveWorkNotice({
        from,
        to: task.column,
        commentExcerpt: notice.commentBody,
        commentCount: notice.commentCount,
      });
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
        // Состояние считаем мы, а не подписчик (VED-320): колонки наши, и
        // только по ним видно, какая значит «тестирование». Берём ту, где
        // карточка лежит на момент отправки, — ту же, о которой говорят слова
        // уведомления.
        statusMark: resolveTaskStatusMark(task.column.name),
      };

      if (outcome.kind === 'commented') {
        this.events.emit(WORK_EVENTS.taskCommented, {
          name: WORK_EVENTS.taskCommented,
          ...base,
          excerpt: outcome.commentExcerpt,
          commentCount: outcome.commentCount,
          columnName: task.column.name,
        } satisfies WorkTaskCommentedEvent);
      } else if (outcome.kind === 'returned') {
        this.events.emit(WORK_EVENTS.taskReturned, {
          name: WORK_EVENTS.taskReturned,
          ...base,
          columnName: outcome.columnName,
          commentExcerpt: outcome.commentExcerpt,
          commentCount: outcome.commentCount,
        } satisfies WorkTaskReturnedEvent);
      } else {
        this.events.emit(WORK_EVENTS.taskStatusChanged, {
          name: WORK_EVENTS.taskStatusChanged,
          ...base,
          fromColumnName: outcome.fromColumnName,
          toColumnName: outcome.toColumnName,
          commentExcerpt: outcome.commentExcerpt,
          commentCount: outcome.commentCount,
        } satisfies WorkTaskStatusChangedEvent);
      }
    } finally {
      await this.prisma.workTaskNotice
        .delete({ where: { id: noticeId } })
        .catch(() => undefined);
    }
  }
}
