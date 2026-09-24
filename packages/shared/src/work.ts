import type { TaskStatusMark } from './task-status';

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
  | 'task_restored'
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
/**
 * Пункт чек-листа (VED-375): 2000, а не 200. Заказчику не хватало места, и он
 * заводил следующий пункт со словом «ПРОДОЛЖЕНИЕ». Длинный пункт в карточке
 * свёрнут до нескольких строк и раскрывается кнопкой «Далее».
 */
export const WORK_CHECKLIST_TEXT_MAX = 2000;
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

/**
 * Человек или ИИ-агент в «Работе»: исполнитель, автор карточки, лицо в
 * истории.
 *
 * Признак `isAgent` едет наружу не ради значка: агенту нечем заполнить аватар,
 * и без пометки он рисуется тем же кружком с буквой, что и живой участник, —
 * то есть программа выдаётся за человека.
 */
export interface WorkPersonDto {
  userId: string;
  /** Всегда результат resolveDisplayName(): духовное имя перекрывает мирское. */
  name: string;
  avatarUrl: string | null;
  /** Служебный аккаунт ИИ. У людей `false`. */
  isAgent: boolean;
}

/** То же там, где аватар не рисуется: автор карточки, лицо в истории. */
export type WorkPersonRefDto = Omit<WorkPersonDto, 'avatarUrl'>;

/** Участник среды глазами остальных участников. */
export interface WorkMemberDto extends WorkPersonDto {
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
  author: WorkPersonDto | null;
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
  actor: WorkPersonRefDto | null;
  /**
   * Человек, чьим ключом действовал агент. Заполнено только у записей ИИ:
   * аккаунт у него один на всех, и «кто это сделал» без поручителя отвечает
   * лишь наполовину.
   */
  onBehalfOf: WorkPersonRefDto | null;
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
  assignee: WorkPersonDto | null;
  labels: WorkLabelDto[];
  /** Сколько пунктов чек-листа отмечено из скольких. */
  checklistDone: number;
  checklistTotal: number;
  commentCount: number;
  attachmentCount: number;
  /** Есть ли описание: значок «в карточке есть текст», а не сам текст. */
  hasDescription: boolean;
  /** Когда заведена. Нужна виду «По дате» (VED-160) — там группировка не по
   *  сроку, а по тому, когда карточку завели, свежие сверху. */
  createdAt: string;
  /**
   * Состояние карточки ярлыком (VED-311): «В работе», «Тестирование»,
   * «Выполнено», «На доработку». `null` — колонка названа иначе, и ярлыка нет.
   *
   * Считает его сервер, хотя название колонки у клиента и так есть: разбор
   * названия должен быть один на портал, иначе ярлык на доске и пометка в
   * ленте уведомлений разъезжаются — ровно то, на что жаловался заказчик
   * (VED-320). Слово и цвет по коду собирает клиент, как и все формулировки.
   */
  statusMark: TaskStatusMark | null;
  /**
   * «Чужое» (VED-320) — для того, кто смотрит, а не для задачи вообще. Задачу
   * составил другой и ведёт другой: у смотрящего она не «Тестерование» и не
   * «На доработку», это не его работа. Такие карточки доска прячет в раздел
   * «Чужие». Автор и исполнитель той же карточки видят `false` и настоящий
   * статус. Задача без исполнителя — чужая для всех, кроме автора (VED-418):
   * иначе задачи, которые завёл другой участник и никому не поручил, стояли
   * у смотрящего среди его собственных.
   */
  foreign: boolean;
  /**
   * «Просмотрено» (VED-365): смотрящий отметил задачу просмотренной, и после
   * этого её не трогал никто другой. Перенос или комментарий другого человека
   * гасит отметку — смотреть надо снова.
   */
  viewed: boolean;
  /**
   * Тематический раздел (VED-430) — колонка вроде «РАБОТА» или «МУЗЫКА». У
   * задачи в колонке раздела совпадает с `columnId`; у задачи в колонке
   * статуса («Тестерование», «Выполнено») — раздел, откуда она туда пришла.
   * `null` — раздел неизвестен.
   */
  sectionId: string | null;
  /**
   * Последняя правка человеком (VED-421, вид «По правке»): поля, перенос,
   * комментарий, чек-лист, вложения. Не бывает раньше `createdAt`.
   */
  editedAt: string;
}

/** Отметить задачу просмотренной или снять отметку (VED-365). */
export interface SetWorkTaskViewedRequest {
  viewed: boolean;
}

export interface WorkTaskViewedResponse {
  taskId: string;
  viewed: boolean;
}

/** Карточка целиком — то, что открывается по нажатию. */
export interface WorkTaskDto extends WorkTaskCardDto {
  boardId: string;
  spaceId: string;
  description: string;
  createdBy: WorkPersonRefDto | null;
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
  /**
   * Состояние, которое колонка даёт лежащим в ней карточкам (VED-311).
   * `null` — колонка названа не одним из четырёх наших слов, и ярлыка у её
   * карточек нет.
   *
   * Зачем отдельно от карточек: перенос на доске оптимистичный — карточка
   * встаёт в новую колонку сразу, до ответа сервера, — и ярлык обязан уехать
   * вместе с ней. Считать его на клиенте по имени колонки нельзя: разбор
   * названия один на портал и живёт у «Работы» (`work-task-status.ts`),
   * иначе доска и лента уведомлений разъедутся снова (VED-320). Поэтому
   * готовый код состояния едет на самой колонке — так же, как `isDone`,
   * которым перенос уже пользуется.
   */
  statusMark: TaskStatusMark | null;
  tasks: WorkTaskCardDto[];
}

export interface WorkBoardSummaryDto {
  id: string;
  name: string;
  position: number;
  taskCount: number;
}

/** Доска целиком: колонки с карточками. Один запрос на открытие экрана. */
/**
 * Поиск задач доски по ключевым словам (VED-76): какие карточки совпали.
 * Доска уже загружена целиком, поэтому отдаём только идентификаторы — она
 * сама спрячет остальные.
 */
/**
 * Архив доски (VED-61): выполненные задачи и убранные с доски карточки.
 * «Выполненные» — всё, что закрыто, даже если карточка ещё стоит в колонке с
 * галочкой; «Убранные» — то, что убрали кнопкой «в архив».
 */
export type WorkArchiveView = 'done' | 'removed';

export interface WorkArchiveItemDto extends WorkTaskCardDto {
  /** В какой колонке карточка стоит или стояла. */
  columnName: string;
  /** Когда убрали с доски; `null` — карточка всё ещё на доске. */
  archivedAt: string | null;
}

export interface WorkArchiveDto {
  view: WorkArchiveView;
  items: WorkArchiveItemDto[];
  /** Показаны не все: архив режется по свежести. */
  hasMore: boolean;
}

export interface WorkTaskSearchResponse {
  query: string;
  taskIds: string[];
}

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
  /**
   * Основной владелец — тот, на ком среда числится (VED-422). Владельцев по
   * роли может быть несколько (совладельцы), а удалить среду, передать
   * владение и не быть пониженным может только он.
   */
  ownerId: string;
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
  /** Колонка; без неё задача встаёт в первую колонку доски. */
  columnId?: string;
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
  /**
   * Сменить раздел задачи, не трогая статус (VED-430): задача в
   * «Тестеровании» остаётся там, но числится уже в другом разделе. Только
   * колонка раздела этой доски; колонку статуса сервер не примет.
   */
  sectionColumnId?: string | null;
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
  /**
   * Раздел, выбранный в окне задачи вместе со статусом (VED-430). Без него
   * при переезде в колонку статуса раздел — колонка, откуда уехали.
   */
  sectionColumnId?: string | null;
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
