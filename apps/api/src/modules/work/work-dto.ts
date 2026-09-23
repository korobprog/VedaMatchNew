import {
  resolveDisplayName,
  type WorkAgendaItemDto,
  type WorkAgendaResponseDto,
  type WorkColor,
  type WorkLabelDto,
  type WorkMemberDto,
  type WorkMemberRole,
  type WorkPersonDto,
  type WorkPersonRefDto,
  type WorkTaskCardDto,
  type WorkTaskPriority,
} from '@vedamatch/shared';
import { resolveTaskStatusMark } from './work-task-status';
import { NO_VIEWER_STATE, type WorkViewerState } from './work-viewer-state';
import { workTaskKey } from './work-validate';

/**
 * Сборка ответов сервиса. Отделено от Prisma: правило «наружу едет
 * `resolveDisplayName`, а не `user.name`» легче всего нарушить незаметно, и
 * держать его в одном месте с тестом дешевле, чем ловить в десяти выборках.
 */

/** Кто угодно из портального профиля — ровно то, что сервису можно читать. */
export interface WorkUserRow {
  id: string;
  name: string;
  spiritualName: string | null;
  avatarUrl: string | null;
  /** Служебный аккаунт ИИ-агента. Выборка обязана тянуть его рядом с именем. */
  isAgent: boolean;
}

export function toWorkPerson(user: WorkUserRow): WorkPersonDto {
  return {
    userId: user.id,
    name: resolveDisplayName(user),
    avatarUrl: user.avatarUrl,
    isAgent: user.isAgent,
  };
}

/** Тот же человек там, где аватар не рисуется: автор карточки, лицо в истории. */
export function toWorkPersonRef(user: WorkUserRow): WorkPersonRefDto {
  const { userId, name, isAgent } = toWorkPerson(user);
  return { userId, name, isAgent };
}

export function toWorkMember(row: {
  role: WorkMemberRole;
  joinedAt: Date;
  user: WorkUserRow;
}): WorkMemberDto {
  return {
    ...toWorkPerson(row.user),
    role: row.role,
    joinedAt: row.joinedAt.toISOString(),
  };
}

export function toWorkLabel(row: {
  id: string;
  name: string;
  color: string;
}): WorkLabelDto {
  return { id: row.id, name: row.name, color: row.color as WorkColor };
}

export interface WorkTaskRow {
  id: string;
  number: number;
  columnId: string;
  title: string;
  description: string;
  position: number;
  priority: WorkTaskPriority;
  dueAt: Date | null;
  completedAt: Date | null;
  assignee: WorkUserRow | null;
  labels: Array<{ label: { id: string; name: string; color: string } }>;
  checklist: Array<{ done: boolean }>;
  _count: { comments: number; attachments: number };
  createdAt: Date;
}

/**
 * Карточка на доске — то, что видно, не открывая её. Описание сюда не едет,
 * только признак «текст есть»: доска на сотню задач иначе тянет мегабайт,
 * который никто не читает.
 *
 * `columnName` — отдельным аргументом, а не полем строки: в выборке доски
 * задачи приезжают вложенными в колонку, и её имя лежит на уровень выше. Оно
 * нужно для ярлыка состояния (VED-311) — разбор названия один на портал
 * (`work-task-status.ts`), чтобы ярлык на карточке и пометка в ленте
 * уведомлений не разъехались (VED-320). `null` — название неизвестно, ярлыка
 * не будет.
 *
 * `viewer` — что карточка значит для смотрящего: «Чужое» и «Просмотрено»
 * (VED-320, VED-365). Считается пачкой на всю доску (`work-viewer-state.ts`),
 * поэтому приезжает готовым.
 */
export function toWorkTaskCard(
  task: WorkTaskRow,
  prefix: string,
  columnName: string | null,
  viewer: WorkViewerState = NO_VIEWER_STATE,
): WorkTaskCardDto {
  return {
    id: task.id,
    key: workTaskKey(prefix, task.number),
    number: task.number,
    columnId: task.columnId,
    title: task.title,
    position: task.position,
    priority: task.priority,
    dueAt: task.dueAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    assignee: task.assignee ? toWorkPerson(task.assignee) : null,
    labels: task.labels.map((link) => toWorkLabel(link.label)),
    checklistDone: task.checklist.filter((item) => item.done).length,
    checklistTotal: task.checklist.length,
    commentCount: task._count.comments,
    attachmentCount: task._count.attachments,
    hasDescription: task.description.trim().length > 0,
    createdAt: task.createdAt.toISOString(),
    statusMark: resolveTaskStatusMark(columnName),
    foreign: viewer.foreign,
    viewed: viewer.viewed,
  };
}

export type WorkAgendaBucket = 'overdue' | 'today' | 'soon' | 'undated';

/**
 * В какую стопку экрана «Мой день» попадает задача.
 *
 * «Сегодня» считается по календарным суткам смотрящего, а не по «менее 24
 * часов»: срок в 23:00 сегодня и в 01:00 завтра — это разные дни для человека,
 * даже когда между ними два часа.
 */
export function workAgendaBucket(
  dueAt: Date | null,
  now: Date,
): WorkAgendaBucket {
  if (!dueAt) return 'undated';
  if (dueAt.getTime() < now.getTime()) return 'overdue';
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  return dueAt.getTime() <= endOfToday.getTime() ? 'today' : 'soon';
}

export function toWorkAgendaItem(
  task: {
    id: string;
    number: number;
    title: string;
    boardId: string;
    dueAt: Date | null;
    priority: WorkTaskPriority;
  },
  space: { id: string; name: string; prefix: string; color: string },
): WorkAgendaItemDto {
  return {
    taskId: task.id,
    key: workTaskKey(space.prefix, task.number),
    title: task.title,
    spaceId: space.id,
    spaceName: space.name,
    spaceColor: space.color as WorkColor,
    boardId: task.boardId,
    dueAt: task.dueAt?.toISOString() ?? null,
    priority: task.priority,
  };
}

/**
 * Строка агенды про отклик в «Вакансиях». Вид и статус хранятся строками —
 * это чужие энумы; наружу отдаётся только известное, остальное отбрасывается.
 */
export function toWorkAgendaResponse(row: {
  responseId: string;
  offerId: string;
  offerTitle: string;
  offerKind: string;
  status: string;
  updatedAt: Date;
}): WorkAgendaResponseDto {
  const kind = (['work', 'seva', 'task'] as const).find(
    (value) => value === row.offerKind,
  );
  const status = (['new', 'in_dialog', 'accepted'] as const).find(
    (value) => value === row.status,
  );
  return {
    responseId: row.responseId,
    offerId: row.offerId,
    offerTitle: row.offerTitle,
    offerKind: kind ?? 'task',
    status: status ?? 'new',
    updatedAt: row.updatedAt.toISOString(),
  };
}
