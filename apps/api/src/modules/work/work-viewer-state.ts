import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Что карточка значит для того, кто на неё смотрит (VED-320, VED-365).
 *
 * Два признака, оба — не свойство задачи, а отношение человека к ней:
 *
 * - «Чужое». Заказчик: задачи, которые «составил другой админ и он же
 *   исполнитель», у меня не должны стоять «Тестированием» — это не моя
 *   работа. И отдельно: «все задачи, которые составлял я, не должны
 *   обозначаться статусом чужое». Отсюда правило: чужая — если я не автор и не
 *   исполнитель. У автора и у исполнителя та же карточка показывает
 *   настоящий статус.
 * - «Просмотрено». Человек открыл задачу, пока она на тестировании
 *   (VED-365: «открытие автоматически должно ставить индикатор, кнопок не
 *   нужно, но только после тестирований»), и после этого её не трогал никто
 *   другой. Перенос или комментарий другого гасит отметку: заказчику
 *   нужно «распознать задачи, которые я должен протестировать, над которыми
 *   уже поработал второй админ и которые я ещё не смотрел».
 */

/** Кто задаче хозяин: автор и исполнитель. */
export interface WorkTaskOwnership {
  assigneeId: string | null;
  createdById: string | null;
  /**
   * Человек, от чьего имени задачу завёл ИИ-агент. `createdById` у такой
   * задачи — служебный аккаунт агента, а составлял её по сути этот человек:
   * «задачи, которые составлял я», — это и они тоже.
   */
  createdOnBehalfOfId?: string | null;
}

/** Хозяева задачи без повторов и пустых мест. */
export function workTaskOwnerIds(task: WorkTaskOwnership): string[] {
  return [
    ...new Set([task.createdById, task.createdOnBehalfOfId, task.assigneeId]),
  ].filter((id): id is string => Boolean(id));
}

/**
 * Чужая ли задача для смотрящего: он не автор и не исполнитель.
 *
 * Задача без исполнителя раньше чужой не считалась никогда — «её может взять
 * любой». Заказчик прислал скриншот (VED-418): VED-296, VED-294, VED-209,
 * VED-166 завёл другой админ и никому не поручил, и у заказчика они стояли
 * среди своих, без «Чужое». Правило для них то же, что для остальных: своя —
 * у автора, чужая — у всех прочих. Взять такую задачу по-прежнему можно:
 * папка «Чужие» открывается одной кнопкой, а поиск находит всё.
 *
 * Задача, у которой не осталось ни автора, ни исполнителя (оба аккаунта
 * удалены), не чужая никому: прятать её не от кого, а спрятанная, она
 * пропала бы у всех.
 */
export function isForeignWorkTask(
  task: WorkTaskOwnership,
  viewerId: string,
): boolean {
  const owners = workTaskOwnerIds(task);
  if (owners.length === 0) return false;
  return !owners.includes(viewerId);
}

/**
 * Кого уведомления о задаче считают её хозяевами (`ownerIds` события
 * `work.task.mark-refreshed`): у остальных получателей пометка «Чужое».
 * `undefined` — хозяев не осталось, пометка у всех одна. Правило то же, что у
 * `isForeignWorkTask`, — чтобы лента и доска не разошлись.
 */
export function markOwnerIds(task: WorkTaskOwnership): string[] | undefined {
  const owners = workTaskOwnerIds(task);
  return owners.length > 0 ? owners : undefined;
}

/**
 * Ставит ли открытие карточки отметку «Просмотрено» (VED-365): только пока
 * задача на тестировании. Вернули на доработку — перенос другого гасит
 * отметку (`isWorkTaskViewed`), и она загорится снова, только когда задачу
 * откроют на следующем тестировании.
 */
export function opensAsViewed(statusMark: string | null): boolean {
  return statusMark === 'testing';
}

/**
 * Горит ли «Просмотрено»: отметка есть и она не старше последнего действия
 * другого человека с задачей. Равенство — в пользу отметки: нажали в ту же
 * миллисекунду, значит видели.
 */
export function isWorkTaskViewed(
  viewedAt: Date | null | undefined,
  changedByOthersAt: Date | null | undefined,
): boolean {
  if (!viewedAt) return false;
  if (!changedByOthersAt) return true;
  return viewedAt.getTime() >= changedByOthersAt.getTime();
}

/**
 * Действия с задачей, сделанные не смотрящим. Своими считаются и действия
 * агента от его имени: сам себе он «новое» не приносит.
 */
export function othersActivityWhere(
  taskIds: string[],
  viewerId: string,
): Prisma.WorkActivityWhereInput {
  return {
    taskId: { in: taskIds },
    AND: [
      { OR: [{ actorId: null }, { actorId: { not: viewerId } }] },
      { OR: [{ onBehalfOfId: null }, { onBehalfOfId: { not: viewerId } }] },
    ],
  };
}

export interface WorkViewerState {
  foreign: boolean;
  viewed: boolean;
  /**
   * Когда смотрящий последний раз открывал задачу или что-то с ней делал
   * (VED-485, вид «Последние»); `null` — не трогал.
   */
  touchedAt: Date | null;
}

export const NO_VIEWER_STATE: WorkViewerState = {
  foreign: false,
  viewed: false,
  touchedAt: null,
};

/** Позднее из двух дат; обе пусты — `null`. */
export function latestDate(
  a: Date | null | undefined,
  b: Date | null | undefined,
): Date | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/** Свои действия с задачами — свои и агента от имени смотрящего. */
export function ownActivityWhere(
  taskIds: string[],
  viewerId: string,
): Prisma.WorkActivityWhereInput {
  return {
    taskId: { in: taskIds },
    OR: [{ actorId: viewerId }, { onBehalfOfId: viewerId }],
  };
}

/**
 * От чьего имени агент заводил задачи: `taskId → userId`. Запись о создании
 * одна на задачу, и только у неё здесь есть смысл.
 */
export async function loadCreatedOnBehalf(
  prisma: PrismaService,
  taskIds: string[],
): Promise<Map<string, string>> {
  if (taskIds.length === 0) return new Map();
  const rows = await prisma.workActivity.findMany({
    where: {
      taskId: { in: taskIds },
      kind: 'task_created',
      onBehalfOfId: { not: null },
    },
    select: { taskId: true, onBehalfOfId: true },
  });
  const byTask = new Map<string, string>();
  for (const row of rows) {
    if (row.taskId && row.onBehalfOfId)
      byTask.set(row.taskId, row.onBehalfOfId);
  }
  return byTask;
}

/**
 * Оба признака для пачки карточек одним заходом: три запроса на доску, а не
 * три на карточку.
 */
export async function loadWorkViewerState(
  prisma: PrismaService,
  tasks: ReadonlyArray<{
    id: string;
    assigneeId: string | null;
    createdById: string | null;
  }>,
  viewerId: string,
): Promise<Map<string, WorkViewerState>> {
  const taskIds = tasks.map((task) => task.id);
  if (taskIds.length === 0) return new Map();

  const [onBehalf, views, changes, visits, own] = await Promise.all([
    loadCreatedOnBehalf(prisma, taskIds),
    prisma.workTaskView.findMany({
      where: { userId: viewerId, taskId: { in: taskIds } },
      select: { taskId: true, viewedAt: true },
    }),
    prisma.workActivity.groupBy({
      by: ['taskId'],
      where: othersActivityWhere(taskIds, viewerId),
      _max: { createdAt: true },
    }),
    prisma.workTaskVisit.findMany({
      where: { userId: viewerId, taskId: { in: taskIds } },
      select: { taskId: true, visitedAt: true },
    }),
    prisma.workActivity.groupBy({
      by: ['taskId'],
      where: ownActivityWhere(taskIds, viewerId),
      _max: { createdAt: true },
    }),
  ]);
  const visitedAt = new Map(visits.map((row) => [row.taskId, row.visitedAt]));
  const actedAt = new Map(own.map((row) => [row.taskId, row._max.createdAt]));
  const viewedAt = new Map(views.map((row) => [row.taskId, row.viewedAt]));
  const changedAt = new Map(
    changes.map((row) => [row.taskId, row._max.createdAt]),
  );

  return new Map(
    tasks.map((task) => [
      task.id,
      {
        foreign: isForeignWorkTask(
          { ...task, createdOnBehalfOfId: onBehalf.get(task.id) ?? null },
          viewerId,
        ),
        viewed: isWorkTaskViewed(viewedAt.get(task.id), changedAt.get(task.id)),
        touchedAt: latestDate(visitedAt.get(task.id), actedAt.get(task.id)),
      },
    ]),
  );
}
