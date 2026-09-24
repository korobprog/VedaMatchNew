import type { NotificationEvent } from '@vedamatch/shared';

/**
 * События «Работы» для шины портала.
 *
 * Имена литералами, а не импортом значения из `@vedamatch/shared`: пакет не
 * собирается, и вывезенное оттуда значение заставило бы Node грузить сырой
 * TypeScript. Тип сверяет литералы с контрактом — тот же приём, что в
 * `notification-copy.ts` у «Уведомлений».
 *
 * Payload самодостаточен: подписчик не имеет права дочитывать недостающее из
 * наших таблиц, поэтому в событии едут и ключ задачи, и её название, и имя
 * того, кто действовал. Формулировку собирает подписчик — мы сообщаем факт.
 */
export const WORK_EVENTS = {
  taskAssigned: 'work.task.assigned',
  taskCommented: 'work.task.commented',
  taskReturned: 'work.task.returned',
  taskStatusChanged: 'work.task.status-changed',
  inviteReceived: 'work.invite.received',
  overtimeRequested: 'work.overtime.requested',
  overtimeDecided: 'work.overtime.decided',
  payoutClosed: 'work.payout.closed',
  payoutPaid: 'work.payout.paid',
} as const satisfies Record<string, NotificationEvent['name']>;

type WorkEvent<TName extends NotificationEvent['name']> = Extract<
  NotificationEvent,
  { name: TName }
>;

export type WorkTaskAssignedEvent = WorkEvent<'work.task.assigned'>;
export type WorkTaskCommentedEvent = WorkEvent<'work.task.commented'>;
export type WorkTaskReturnedEvent = WorkEvent<'work.task.returned'>;
export type WorkTaskStatusChangedEvent = WorkEvent<'work.task.status-changed'>;
export type WorkInviteReceivedEvent = WorkEvent<'work.invite.received'>;

/**
 * Кого оповещать о событии вокруг задачи: исполнителя и того, кто её завёл, —
 * кроме самого действующего.
 *
 * Себе уведомление о собственном действии — самый быстрый способ научить
 * человека не читать колокольчик. Дубли тоже убираем: у задачи, которую
 * человек завёл и сам же ведёт, получатель один.
 */
export function workTaskRecipients(
  task: { assigneeId: string | null; createdById: string | null },
  actorId: string,
): string[] {
  return [...new Set([task.assigneeId, task.createdById])].filter(
    (id): id is string => Boolean(id) && id !== actorId,
  );
}

/**
 * У кого поднять задачу в ленте на смене статуса (VED-320): у тех же, кому о
 * задаче сообщаем, — кроме двигавшего, — и только у участников среды.
 *
 * Членство проверяем здесь, а не в очереди дозревания, потому что подъём
 * уходит сразу. Воркер проверяет его на отправке по той же причине: человека
 * могли исключить из среды, а поднятая строка — это сигнал «в чужой теперь
 * задаче что-то изменилось», которого ему знать не положено.
 */
export function workTaskLiftRecipients(
  task: { assigneeId: string | null; createdById: string | null },
  actorId: string,
  memberIds: readonly string[],
): string[] {
  const members = new Set(memberIds);
  return workTaskRecipients(task, actorId).filter((id) => members.has(id));
}
