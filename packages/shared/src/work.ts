// Типы сервиса «Работа». См. docs/work-service-plan.md.
//
// Раздел «Планировщик»: рабочие среды, доски, колонки, задачи. Денег здесь
// нет и быть не должно — как только за задачу платят, это Рынок.

/** Роль в рабочей среде. Владелец ровно один. */
export type WorkMemberRole = 'owner' | 'admin' | 'member' | 'viewer';

export type WorkTaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export type WorkActivityKind =
  | 'task_created'
  | 'task_moved'
  | 'task_assigned'
  | 'task_due_set'
  | 'task_completed'
  | 'task_archived'
  | 'comment_added'
  | 'member_joined';

/**
 * Имена акцентных токенов из globals.css. Цвет хранится именем, а не
 * `#RRGGBB`: захардкоженный цвет переживает переключение темы и остаётся от
 * чужой — правило дизайн-системы портала.
 */
export const WORK_COLORS = [
  'magenta',
  'cyan',
  'gold',
  'violet',
  'blue',
] as const;
export type WorkColor = (typeof WORK_COLORS)[number];

export const WORK_SPACE_NAME_MAX = 60;
export const WORK_SPACE_DESCRIPTION_MAX = 500;
export const WORK_BOARD_NAME_MAX = 60;
export const WORK_COLUMN_NAME_MAX = 40;
export const WORK_TASK_TITLE_MAX = 200;
export const WORK_TASK_DESCRIPTION_MAX = 10_000;
export const WORK_COMMENT_MAX = 4000;
export const WORK_CHECKLIST_TEXT_MAX = 200;
export const WORK_LABEL_NAME_MAX = 24;

/** Сколько колонок и досок терпит одна среда. Предел от абсурда, не от жадности. */
export const WORK_MAX_COLUMNS_PER_BOARD = 12;
export const WORK_MAX_BOARDS_PER_SPACE = 20;

/** Вложение задачи: 20 МБ — со скриншотом и договором в PDF помещается. */
export const WORK_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const WORK_MAX_ATTACHMENTS_PER_TASK = 20;

/**
 * Колонки новой доски. Три, а не семь: пустая доска с семью колонками
 * отпугивает сильнее, чем отсутствие функции. Последняя закрывает задачу.
 */
export const WORK_DEFAULT_COLUMNS = [
  { name: 'Надо', isDone: false },
  { name: 'В работе', isDone: false },
  { name: 'Готово', isDone: true },
] as const;

/** Участник среды глазами остальных участников. */
export interface WorkMemberDto {
  userId: string;
  /** Всегда результат resolveDisplayName(): духовное имя перекрывает мирское. */
  name: string;
  avatarUrl: string | null;
  role: WorkMemberRole;
  joinedAt: string;
}

export interface WorkLabelDto {
  id: string;
  name: string;
  color: WorkColor;
}

export interface WorkChecklistItemDto {
  id: string;
  text: string;
  done: boolean;
  position: number;
}

export interface WorkCommentDto {
  id: string;
  body: string;
  author: { userId: string; name: string; avatarUrl: string | null } | null;
  createdAt: string;
  editedAt: string | null;
}

export interface WorkAttachmentDto {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  /** Подписанная ссылка на 6 часов; прямой адрес бакета отдаст 403. */
  url: string;
  createdAt: string;
}

export interface WorkActivityDto {
  id: string;
  kind: WorkActivityKind;
  actor: { userId: string; name: string } | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

/**
 * Карточка на доске — то, что видно, не открывая её. Описание, комментарии и
 * вложения сюда не входят: доска на сотню задач иначе тянет мегабайт текста.
 */
export interface WorkTaskCardDto {
  id: string;
  /** Человекочитаемый номер: `VM-14`. Собран из префикса среды и номера. */
  key: string;
  number: number;
  columnId: string;
  title: string;
  position: number;
  priority: WorkTaskPriority;
  dueAt: string | null;
  completedAt: string | null;
  assignee: { userId: string; name: string; avatarUrl: string | null } | null;
  labels: WorkLabelDto[];
  /** Сколько пунктов чек-листа отмечено из скольких. */
  checklistDone: number;
  checklistTotal: number;
  commentCount: number;
  attachmentCount: number;
  /** Есть ли описание: значок «в карточке есть текст», а не сам текст. */
  hasDescription: boolean;
}

/** Карточка целиком — то, что открывается по нажатию. */
export interface WorkTaskDto extends WorkTaskCardDto {
  boardId: string;
  spaceId: string;
  description: string;
  createdBy: { userId: string; name: string } | null;
  checklist: WorkChecklistItemDto[];
  comments: WorkCommentDto[];
  attachments: WorkAttachmentDto[];
  activity: WorkActivityDto[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface WorkColumnDto {
  id: string;
  name: string;
  position: number;
  /** 0 — без предела. Превышение подсвечивается, но перенос не запрещает. */
  wipLimit: number;
  isDone: boolean;
  tasks: WorkTaskCardDto[];
}

export interface WorkBoardSummaryDto {
  id: string;
  name: string;
  position: number;
  taskCount: number;
}

/** Доска целиком: колонки с карточками. Один запрос на открытие экрана. */
export interface WorkBoardDto {
  id: string;
  spaceId: string;
  name: string;
  columns: WorkColumnDto[];
  /** Метки среды: нужны редактору карточки, а не только тем, что уже стоят. */
  labels: WorkLabelDto[];
  members: WorkMemberDto[];
  /** Права смотрящего на этой доске — интерфейс не гадает, а спрашивает. */
  role: WorkMemberRole;
  /**
   * Кто смотрит. Нужен, чтобы новая карточка по умолчанию доставалась себе:
   * список участников одинаков для всех, и вычислить в нём себя неоткуда.
   */
  viewerId: string;
}

export interface WorkSpaceSummaryDto {
  id: string;
  name: string;
  prefix: string;
  description: string;
  color: WorkColor;
  isPersonal: boolean;
  role: WorkMemberRole;
  memberCount: number;
  boardCount: number;
  openTaskCount: number;
  createdAt: string;
}

export interface WorkSpaceDto extends WorkSpaceSummaryDto {
  members: WorkMemberDto[];
  labels: WorkLabelDto[];
  boards: WorkBoardSummaryDto[];
}

export interface WorkInviteDto {
  id: string;
  role: WorkMemberRole;
  expiresAt: string;
  maxUses: number;
  useCount: number;
  createdAt: string;
  /** Кому именное приглашение; null — ссылка для кого угодно. */
  invitee: { userId: string; name: string } | null;
  /**
   * Полная ссылка. Отдаётся ТОЛЬКО в ответе на создание: в базе лежит хеш, и
   * второй раз показать её неоткуда. В списке приглашений всегда null.
   */
  url: string | null;
}

/** Что видит человек, перешедший по ссылке, — до того как согласится войти. */
export interface WorkInvitePreviewDto {
  spaceName: string;
  spaceColor: WorkColor;
  role: WorkMemberRole;
  invitedBy: string | null;
  memberCount: number;
  expiresAt: string;
  /** Уже участник: экран скажет «вы здесь» и уведёт на доску. */
  alreadyMember: boolean;
}

export interface CreateWorkSpaceRequest {
  name: string;
  description?: string;
  color?: WorkColor;
}

export interface UpdateWorkSpaceRequest {
  name?: string;
  description?: string;
  color?: WorkColor;
}

/** Человек, которого можно позвать в среду. */
export interface WorkContactDto {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** Приглашение ему уже выписано и ещё действует. */
  alreadyInvited: boolean;
}

/**
 * Где искали.
 *
 * `known` — граф знакомств спрашивающего, обычный случай: «Работа» не место,
 * где ищут незнакомых. `portal` — весь портал; так ищет администрация,
 * которая на портале и без того «друг всех» (см. isPortalStaff).
 *
 * Разница видна человеку: пустая выдача у одного значит «среди знакомых
 * никого», у другого — «на портале никого», и путать эти два ответа нельзя.
 */
export type WorkContactScope = 'known' | 'portal';

/** Ответ поиска людей для приглашения: выдача и то, где её искали. */
export interface WorkContactsDto {
  scope: WorkContactScope;
  items: WorkContactDto[];
  /**
   * Поиск по всему порталу без запроса не выполняется — перечислять портал
   * целиком незачем. Тогда `items` пуст, а здесь стоит длина, с которой
   * поиск начнёт отвечать. У поиска по знакомым порога нет: `null`.
   */
  minQuery: number | null;
}

export interface CreateWorkInviteRequest {
  role?: Exclude<WorkMemberRole, 'owner'>;
  /** Дней жизни ссылки; по умолчанию 7. */
  expiresInDays?: number;
  /** 0 — без ограничения. */
  maxUses?: number;
  /** Именное приглашение человеку с портала. */
  inviteeId?: string;
}

export interface UpdateWorkMemberRequest {
  role: Exclude<WorkMemberRole, 'owner'>;
}

export interface CreateWorkBoardRequest {
  name: string;
}

export interface UpdateWorkBoardRequest {
  name?: string;
}

export interface CreateWorkColumnRequest {
  name: string;
  wipLimit?: number;
  isDone?: boolean;
}

export interface UpdateWorkColumnRequest {
  name?: string;
  wipLimit?: number;
  isDone?: boolean;
  /** Перестановка колонки: между какими соседями встать. */
  afterColumnId?: string | null;
  beforeColumnId?: string | null;
}

export interface CreateWorkTaskRequest {
  columnId: string;
  title: string;
  description?: string;
  priority?: WorkTaskPriority;
  /** ISO-дата и время. */
  dueAt?: string | null;
  assigneeId?: string | null;
  labelIds?: string[];
}

export interface UpdateWorkTaskRequest {
  title?: string;
  description?: string;
  priority?: WorkTaskPriority;
  dueAt?: string | null;
  assigneeId?: string | null;
  labelIds?: string[];
}

/**
 * Перенос карточки. Соседи, а не индекс: пока запрос летит, доска у другого
 * человека могла измениться, и «поставить третьей» промахнётся, а «между
 * этими двумя» — нет.
 */
export interface MoveWorkTaskRequest {
  columnId: string;
  afterTaskId?: string | null;
  beforeTaskId?: string | null;
}

export interface CreateWorkCommentRequest {
  body: string;
}

export interface CreateWorkChecklistItemRequest {
  text: string;
}

export interface UpdateWorkChecklistItemRequest {
  text?: string;
  done?: boolean;
}

export interface CreateWorkLabelRequest {
  name: string;
  color?: WorkColor;
}

/** Экран «Мой день»: задачи со сроком по всем средам сразу. */
export interface WorkAgendaDto {
  overdue: WorkAgendaItemDto[];
  today: WorkAgendaItemDto[];
  soon: WorkAgendaItemDto[];
  /** Назначенные на меня, но без срока. */
  undated: WorkAgendaItemDto[];
  /**
   * Мои живые отклики в «Вакансиях». Работа хранит их у себя минимальной
   * записью из событий `vacancies.*`, а не читает чужие таблицы.
   */
  responses: WorkAgendaResponseDto[];
}

export type WorkAgendaResponseStatus = 'new' | 'in_dialog' | 'accepted';

export interface WorkAgendaResponseDto {
  responseId: string;
  offerId: string;
  offerTitle: string;
  offerKind: 'work' | 'seva' | 'task';
  status: WorkAgendaResponseStatus;
  /** Когда статус менялся в последний раз. */
  updatedAt: string;
}

export interface WorkAgendaItemDto {
  taskId: string;
  key: string;
  title: string;
  spaceId: string;
  spaceName: string;
  spaceColor: WorkColor;
  boardId: string;
  dueAt: string | null;
  priority: WorkTaskPriority;
}

/** Живые события доски (SSE). Один поток на человека, как в «Общении». */
export type WorkStreamEvent =
  | { type: 'task.created'; boardId: string; task: WorkTaskCardDto }
  | { type: 'task.updated'; boardId: string; task: WorkTaskCardDto }
  | {
      type: 'task.moved';
      boardId: string;
      taskId: string;
      columnId: string;
      position: number;
    }
  | { type: 'task.removed'; boardId: string; taskId: string }
  | { type: 'board.changed'; boardId: string };
