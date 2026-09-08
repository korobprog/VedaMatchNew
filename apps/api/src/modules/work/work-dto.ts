import {
  resolveDisplayName,
  type WorkAgendaItemDto,
  type WorkAgendaResponseDto,
  type WorkColor,
  type WorkLabelDto,
  type WorkMemberDto,
  type WorkMemberRole,
  type WorkTaskCardDto,
  type WorkTaskPriority,
} from '@vedamatch/shared';
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
}

export function toWorkPerson(user: WorkUserRow): {
  userId: string;
  name: string;
  avatarUrl: string | null;
} {
  return {
    userId: user.id,
    name: resolveDisplayName(user),
    avatarUrl: user.avatarUrl,
  };
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
}

/**
 * Карточка на доске — то, что видно, не открывая её. Описание сюда не едет,
 * только признак «текст есть»: доска на сотню задач иначе тянет мегабайт,
 * который никто не читает.
 */
export function toWorkTaskCard(
  task: WorkTaskRow,
  prefix: string,
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
