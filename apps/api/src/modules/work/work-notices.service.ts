import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveNotifyAt } from './work-notice';
import { workTaskNoticeRecipients } from './work-events';

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
 *
 * Получатель в строке заморожен в момент постановки, а живёт строка три
 * минуты — VED-507 родился именно из этого окна: за него человек успевает
 * поручить задачу другому, и уведомление о ней приходит уже не тому. Поэтому
 * здесь не только ставим, но и гасим: чужие и свои отжившие строки (см.
 * `cancelOnOwnerChange`) и свои собственные (`clearOwn`).
 */
@Injectable()
export class WorkNoticesService {
  private readonly logger = new Logger(WorkNoticesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Записать факт переезда. Получатель — исполнитель (VED-507), а без него
   * автор; не тот, кто двигал, и не тот, от чьего имени двигал агент.
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
    onBehalfOfId: string | null = null,
    now = new Date(),
  ): Promise<void> {
    await this.clearOwn(task.id, actorId, onBehalfOfId);
    for (const recipientId of workTaskNoticeRecipients(
      task,
      actorId,
      onBehalfOfId,
    )) {
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
    onBehalfOfId: string | null = null,
    now = new Date(),
  ): Promise<void> {
    await this.clearOwn(task.id, actorId, onBehalfOfId);
    for (const recipientId of workTaskNoticeRecipients(
      task,
      actorId,
      onBehalfOfId,
    )) {
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
   * Сменился исполнитель (VED-507): очередь помнит получателя, замороженного
   * в момент постановки, а владелец задачи за эти же минуты поменялся.
   *
   * Остаются только строки на нынешнего владельца — того, на ком сейчас ход,
   * — и ни одной на действовавшего: он и сам в курсе, и от его имени мог
   * работать агент. Строки бывшего исполнителя уходят вместе с поручением:
   * уведомление о чужой теперь задаче — то самое, на что жаловался заказчик.
   *
   * Возвращает получателей, чьи строки сняты, — их пишем в лог.
   */
  async cancelOnOwnerChange(
    taskId: string,
    actorId: string,
    ownerId: string | null,
    onBehalfOfId: string | null = null,
  ): Promise<string[]> {
    const rows = await this.prisma.workTaskNotice.findMany({
      where: { taskId },
      select: { id: true, recipientId: true },
    });
    const acted = new Set(
      [actorId, onBehalfOfId].filter((id): id is string => Boolean(id)),
    );
    const stale = rows.filter(
      (row) => row.recipientId !== ownerId || acted.has(row.recipientId),
    );
    if (stale.length === 0) return [];

    // Взятые воркером строки тоже убираем: воркер дочитывает их перед самой
    // отправкой, и удаление до этого момента отменяет отправку (VED-507).
    await this.prisma.workTaskNotice.deleteMany({
      where: { id: { in: stale.map((row) => row.id) } },
    });
    const recipients = [...new Set(stale.map((row) => row.recipientId))];
    this.logger.log(
      `Отменено уведомлений о задаче ${taskId}: ${stale.length} — ${recipients.join(', ')}`,
    );
    return recipients;
  }

  /**
   * Человек сам поработал с задачей — своё дозревающее уведомление о ней ему
   * больше не нужно.
   *
   * «Зачем ему снова утыкаться в то что он сам только что исправил или сменил
   * статус?» — дословная формулировка заказчика в VED-298. `workTaskRecipients`
   * отбрасывает актора на входе, но строку ему могли завести раньше и другие
   * руки: тогда через три минуты он получил бы новость о карточке, которую
   * только что открывал и правил сам. То же и с тем, от чьего имени работал
   * агент: распорядился человек — гасим строку человека.
   *
   * Взятую воркером строку снимаем тоже: воркер читает её заново перед
   * отправкой, и снятие до этого момента отменяет отправку. Не снимали бы —
   * человек, только что поручивший задачу, получил бы о ней всплывшее
   * уведомление ровно в тот же тик (VED-507).
   */
  private async clearOwn(
    taskId: string,
    actorId: string,
    onBehalfOfId: string | null = null,
  ): Promise<void> {
    const recipients = [
      ...new Set(
        [actorId, onBehalfOfId].filter((id): id is string => Boolean(id)),
      ),
    ];
    await this.prisma.workTaskNotice.deleteMany({
      where: { taskId, recipientId: { in: recipients } },
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
