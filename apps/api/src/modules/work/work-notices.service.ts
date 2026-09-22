import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveNotifyAt } from './work-notice';
import { workTaskRecipients } from './work-events';

type NoticeTask = {
  id: string;
  assigneeId: string | null;
  createdById: string | null;
};

/**
 * Постановка работы с карточкой в очередь дозревания.
 *
 * Отдельный сервис, а не пара строк внутри переноса: очередь трогают ещё
 * воркер, комментарий и удаление задачи, и правило «кому и когда» должно жить
 * в одном месте. Сама отправка — в work-notice-worker.service.ts, решение
 * «что сказать по итогам окна» — в work-notice.ts.
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
    task: NoticeTask,
    actorId: string,
    fromColumnId: string,
    now = new Date(),
  ): Promise<void> {
    await this.clearOwn(task.id, actorId);
    for (const recipientId of workTaskRecipients(task, actorId)) {
      const existing = await this.find(task.id, recipientId, actorId);
      await this.prisma.workTaskNotice.upsert({
        where: this.key(task.id, recipientId, actorId),
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
          fromColumnId: existing?.fromColumnId ?? fromColumnId,
          notifyAt: resolveNotifyAt(existing?.notifyAt ?? null, now),
        },
      });
    }
  }

  /**
   * Записать факт комментария. Уведомление уходит через то же окно, что и
   * переезд, и по той же строке очереди — в этом весь смысл правки VED-298:
   * человек комментирует карточку и тут же переносит её, а получателю прилетало
   * дважды об одном действии. Теперь решение принимается один раз, на отправке.
   *
   * Отсрочка на комментарии — сознательная цена. Она же и польза: очередь
   * реплик, которую человек дописывает по одной, доедет одним уведомлением.
   */
  async enqueueComment(
    task: NoticeTask,
    actorId: string,
    body: string,
    now = new Date(),
  ): Promise<void> {
    await this.clearOwn(task.id, actorId);
    for (const recipientId of workTaskRecipients(task, actorId)) {
      const existing = await this.find(task.id, recipientId, actorId);
      await this.prisma.workTaskNotice.upsert({
        where: this.key(task.id, recipientId, actorId),
        create: {
          taskId: task.id,
          recipientId,
          actorId,
          commentBody: body,
          commentCount: 1,
          notifyAt: resolveNotifyAt(null, now),
        },
        update: {
          // В ленте показывается последняя реплика, а сколько их было —
          // счётчиком: подписчик допишет «и ещё две».
          commentBody: body,
          commentCount: { increment: 1 },
          notifyAt: resolveNotifyAt(existing?.notifyAt ?? null, now),
        },
      });
    }
  }

  /**
   * Человек сам поработал с задачей — своё дозревающее уведомление о ней ему
   * больше не нужно.
   *
   * «Зачем ему снова утыкаться в то что он сам только что исправил или сменил
   * статус?» — дословная формулировка заказчика в VED-298. `workTaskRecipients`
   * отбрасывает актора на входе, но строку ему могли завести раньше и другие
   * руки: тогда через три минуты он получил бы новость о карточке, которую
   * только что открывал и правил сам. Взятую воркером строку не трогаем — она
   * уже в отправке.
   */
  private async clearOwn(taskId: string, actorId: string): Promise<void> {
    await this.prisma.workTaskNotice.deleteMany({
      where: { taskId, recipientId: actorId, claimedAt: null },
    });
  }

  private key(taskId: string, recipientId: string, actorId: string) {
    return {
      taskId_recipientId_actorId: { taskId, recipientId, actorId },
    };
  }

  private async find(taskId: string, recipientId: string, actorId: string) {
    return this.prisma.workTaskNotice.findUnique({
      where: this.key(taskId, recipientId, actorId),
      select: { notifyAt: true, fromColumnId: true },
    });
  }
}
