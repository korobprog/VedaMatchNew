import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveNotifyAt } from './work-notice';
import { workTaskRecipients } from './work-events';

/**
 * Постановка переезда карточки в очередь дозревания.
 *
 * Отдельный сервис, а не пара строк внутри переноса: очередь трогают ещё
 * воркер и удаление задачи, и правило «кому и когда» должно жить в одном
 * месте. Сама отправка — в work-notice-worker.service.ts.
 */
@Injectable()
export class WorkNoticesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Записать факт переезда. Получатели — те же, что у прочих новостей про
   * задачу: исполнитель и автор, кроме того, кто двигал.
   *
   * Существующая запись обновляется, а не создаётся второй: за окно карточку
   * могут перенести несколько раз, и человека это касается один раз. Колонку
   * `fromColumnId` при этом не переписываем — она осталась от первого
   * движения, и именно от неё считается «вернулось на место».
   */
  async enqueueMove(
    task: { id: string; assigneeId: string | null; createdById: string | null },
    actorId: string,
    fromColumnId: string,
    now = new Date(),
  ): Promise<void> {
    const recipients = workTaskRecipients(task, actorId);
    if (recipients.length === 0) return;

    for (const recipientId of recipients) {
      const existing = await this.prisma.workTaskNotice.findUnique({
        where: { taskId_recipientId: { taskId: task.id, recipientId } },
        select: { notifyAt: true },
      });
      await this.prisma.workTaskNotice.upsert({
        where: { taskId_recipientId: { taskId: task.id, recipientId } },
        create: {
          taskId: task.id,
          recipientId,
          actorId,
          fromColumnId,
          notifyAt: resolveNotifyAt(null, now),
        },
        // Взятую воркером запись не воскрешаем сбросом claimedAt: он вот-вот
        // отправит её и удалит, а этот перенос попадёт в следующее окно.
        update: {
          actorId,
          notifyAt: resolveNotifyAt(existing?.notifyAt ?? null, now),
        },
      });
    }
  }
}
