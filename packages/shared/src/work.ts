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
  kind: WorkBoardKind;
  /** Настройки оплаты; `null` у обычной доски. */
  commercial: WorkBoardCommercialDto | null;
  /**
   * Смотрящий видит деньги доски целиком: ставки, бюджет, чужие суммы. Это
   * ведущий доски и администрация среды; остальные видят свои часы и суммы.
   */
  canSeeFinance: boolean;
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
  /**
   * Доска среды коммерческая (VED-458): на сайте доска появляется вместе со
   * средой, поэтому вопрос «коммерческая или нет» задаётся здесь. Без поля —
   * обычная доска.
   */
  commercial?: WorkCommercialSettingsInput | null;
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
  /** Коммерческая доска (VED-458); без поля — обычная. */
  commercial?: WorkCommercialSettingsInput | null;
}

export interface UpdateWorkBoardRequest {
  name?: string;
  /**
   * Настройки оплаты (VED-458). Объект — доска коммерческая с этими
   * настройками (недостающие поля не меняются); `null` — доска становится
   * обычной, а цены, часы и сметы прячутся, но не стираются.
   */
  commercial?: WorkCommercialSettingsInput | null;
  /** Ведущий доски — участник среды. */
  leadId?: string;
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

// ===== Коммерческая доска (VED-458) =====

export type WorkBoardKind = 'regular' | 'commercial';
/** Почасовая оплата или фиксированная цена задачи. */
export type WorkPricingModel = 'hourly' | 'fixed';
/**
 * Часы сверх дневной нормы: `on_request` — в счёт идут только одобренные
 * ведущим, `auto` — всё сверх нормы сразу по повышенной ставке.
 */
export type WorkOvertimeMode = 'on_request' | 'auto';

export const WORK_CURRENCIES = ['RUB', 'USD', 'EUR', 'INR'] as const;
export type WorkCurrency = (typeof WORK_CURRENCIES)[number];

export const WORK_DEFAULT_TIMEZONE = 'Europe/Moscow';
export const WORK_CLIENT_NAME_MAX = 80;
export const WORK_TIME_NOTE_MAX = 200;
export const WORK_LINE_ITEM_TITLE_MAX = 120;
/** Одна запись времени — не больше суток: больше значит «забыл остановить». */
export const WORK_TIME_ENTRY_MAX_MINUTES = 24 * 60;
/** Потолок любой суммы в копейках (центах): 20 млн единиц валюты — влезает в Int базы. */
export const WORK_MONEY_MAX_MINOR = 2_000_000_000;

/**
 * Настройки оплаты доски. Деньги — в минимальных единицах валюты (копейки,
 * центы, пайсы): дробные рубли в `Float` теряют копейки на сложении.
 */
export interface WorkCommercialSettingsInput {
  clientName?: string;
  currency?: WorkCurrency;
  pricingModel?: WorkPricingModel;
  /** Ставка за час в пределах дневной нормы. */
  rateMinor?: number;
  /** Дневная норма на исполнителя; 0 — нормы нет, всё по обычной ставке. */
  dailyNormMinutes?: number;
  /** Ставка за час сверх нормы. */
  overtimeRateMinor?: number;
  overtimeMode?: WorkOvertimeMode;
  /** Бюджет доски; 0 — без бюджета. */
  budgetMinor?: number;
  /** IANA-пояс, по которому считается «день» для нормы. */
  timezone?: string;
  /** Как часто подбивать (VED-460). */
  payoutPeriod?: WorkPayoutPeriodKind;
  /** День подбития: день недели ISO 1…7 или число месяца 1…28. */
  payoutDay?: number;
}

export interface WorkBoardCommercialDto {
  clientName: string;
  currency: WorkCurrency;
  pricingModel: WorkPricingModel;
  dailyNormMinutes: number;
  overtimeMode: WorkOvertimeMode;
  timezone: string;
  /** Ведущий: одобряет, закрывает периоды, видит все деньги. */
  lead: WorkPersonRefDto | null;
  payoutPeriod: WorkPayoutPeriodKind;
  payoutDay: number;
  /** Ставки и бюджет — только тем, кто видит деньги доски; остальным `null`. */
  rates: {
    rateMinor: number;
    overtimeRateMinor: number;
    budgetMinor: number;
  } | null;
}

export interface WorkTimeEntryDto {
  id: string;
  person: WorkPersonRefDto | null;
  startedAt: string;
  /** `null` — таймер идёт. */
  endedAt: string | null;
  minutes: number;
  /** Из них в пределах дневной нормы исполнителя. */
  normalMinutes: number;
  /** Из них сверх нормы. */
  overtimeMinutes: number;
  /** Из сверх нормы — покрыто одобренным запросом (VED-459). */
  approvedOvertimeMinutes: number;
  note: string;
  /** Сумма за запись; `null` — смотрящему не положено её видеть. */
  amountMinor: number | null;
  /** Запись смотрящего: её можно удалить. */
  mine: boolean;
  /** Вошла в подбитый период выплат (VED-460): удалить уже нельзя. */
  locked: boolean;
}

export type WorkLineItemKind = 'expense' | 'discount';

export interface WorkLineItemDto {
  id: string;
  kind: WorkLineItemKind;
  title: string;
  /** Всегда положительная; скидка вычитается по `kind`. */
  amountMinor: number;
  /** Вошла в подбитый период выплат: удалить уже нельзя. */
  locked: boolean;
}

export interface WorkFinanceTotalsDto {
  minutes: number;
  normalMinutes: number;
  overtimeMinutes: number;
  /** Сверх нормы, но без одобрения: видно, в счёт не идёт. */
  pendingOvertimeMinutes: number;
  /** Суммы — `null` у тех, кто не видит деньги доски. */
  workMinor: number | null;
  expensesMinor: number | null;
  discountMinor: number | null;
  totalMinor: number | null;
}

/** Время и стоимость карточки коммерческой доски. */
export interface WorkTaskFinanceDto {
  taskId: string;
  currency: WorkCurrency;
  pricingModel: WorkPricingModel;
  overtimeMode: WorkOvertimeMode;
  dailyNormMinutes: number;
  estimateMinutes: number | null;
  /** Оценка деньгами: по ставке или фиксированная цена. */
  estimateMinor: number | null;
  /** Фиксированная цена задачи; `null` — не задана или не положено видеть. */
  priceMinor: number | null;
  entries: WorkTimeEntryDto[];
  lineItems: WorkLineItemDto[];
  totals: WorkFinanceTotalsDto;
  /** Своё: сколько часов и на какую сумму у смотрящего в этой задаче. */
  mine: { minutes: number; amountMinor: number };
  /** Идущий таймер смотрящего в этой задаче. */
  running: WorkTimeEntryDto | null;
  canSeeFinance: boolean;
  /** «Сегодня» в поясе доски — от него форма запроса сверх нормы. */
  today: string;
  /**
   * Запросы сверх нормы по этой задаче (VED-459): ведущему — все, остальным —
   * свои.
   */
  overtimeRequests: WorkOvertimeRequestDto[];
  /** Можно ли тут просить часы сверх нормы: почасовая и «только по запросу». */
  canRequestOvertime: boolean;
}

/** Шапка коммерческой доски: бюджет и сколько израсходовано. */
export interface WorkBoardFinanceDto {
  boardId: string;
  currency: WorkCurrency;
  budgetMinor: number;
  spentMinor: number;
  minutes: number;
  overtimeMinutes: number;
  pendingOvertimeMinutes: number;
  /** Запросы сверх нормы, ждущие решения ведущего. */
  pendingRequestCount: number;
}

/** Время задним числом. */
export interface CreateWorkTimeEntryRequest {
  /** ISO-время начала. */
  startedAt: string;
  minutes: number;
  note?: string;
}

export interface UpdateWorkTaskFinanceRequest {
  estimateMinutes?: number | null;
  priceMinor?: number | null;
}

export interface CreateWorkLineItemRequest {
  kind: WorkLineItemKind;
  title: string;
  amountMinor: number;
}

// ===== Запросы сверх нормы (VED-459) =====

export type WorkOvertimeRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export const WORK_OVERTIME_REASON_MAX = 300;
/** Самый длинный период одного запроса: дольше — это уже новая норма. */
export const WORK_OVERTIME_MAX_DAYS = 31;
/** Сверх нормы в день — от 15 минут до 12 часов. */
export const WORK_OVERTIME_MIN_MINUTES = 15;
export const WORK_OVERTIME_MAX_MINUTES = 12 * 60;

export interface WorkOvertimeRequestDto {
  id: string;
  boardId: string;
  task: { id: string; key: string; title: string } | null;
  person: WorkPersonRefDto | null;
  /** Дни пояса доски включительно: `2026-09-24`. */
  fromDay: string;
  toDay: string;
  days: number;
  minutesPerDay: number;
  reason: string;
  status: WorkOvertimeRequestStatus;
  /** Потолок денег: все дни целиком по ставке сверх нормы. `null` — не положено видеть. */
  maxCostMinor: number | null;
  decidedBy: WorkPersonRefDto | null;
  decidedAt: string | null;
  decisionNote: string;
  createdAt: string;
  mine: boolean;
}

export interface WorkOvertimeRequestsDto {
  currency: WorkCurrency;
  /** Смотрящий решает запросы: ведущий или администрация. */
  canDecide: boolean;
  items: WorkOvertimeRequestDto[];
}

export interface CreateWorkOvertimeRequest {
  fromDay: string;
  toDay: string;
  minutesPerDay: number;
  reason?: string;
}

export interface DecideWorkOvertimeRequest {
  decision: 'approved' | 'rejected';
  note?: string;
}

// ===== Календарь выплат и подбитие (VED-460) =====

export type WorkPayoutPeriodKind = 'weekly' | 'biweekly' | 'monthly';
/**
 * `open` — период идёт, в базе его нет; `closed` — подбит, итог заморожен;
 * `sent` — итог отправлен клиенту; `paid` — оплачен.
 */
export type WorkPayoutStatus = 'open' | 'closed' | 'sent' | 'paid';

export const WORK_PAYOUT_NOTE_MAX = 300;

export interface WorkPayoutCorrection {
  /**
   * `late_time` — время внесено задним числом в уже подбитые дни: оно уже
   * в суммах этого периода, строка — пояснение. `late_approval` — сверх нормы
   * одобрили после подбития: доплата сверху.
   */
  kind: 'late_time' | 'late_approval';
  userId: string | null;
  name: string;
  taskKey: string;
  day: string;
  minutes: number;
  amountMinor: number;
}

/** Замороженный итог периода. */
export interface WorkPayoutSnapshot {
  people: Array<{
    userId: string | null;
    name: string;
    minutes: number;
    normalMinutes: number;
    /** Сверх нормы, пошедшее в счёт. */
    overtimeMinutes: number;
    /** Сверх нормы без одобрения на момент подбития. */
    pendingOvertimeMinutes: number;
    workMinor: number;
  }>;
  tasks: Array<{
    taskId: string;
    key: string;
    title: string;
    /** Задачу закрыли в этом периоде. */
    done: boolean;
    minutes: number;
    workMinor: number;
    expensesMinor: number;
    discountMinor: number;
  }>;
  corrections: WorkPayoutCorrection[];
  totals: {
    minutes: number;
    normalMinutes: number;
    overtimeMinutes: number;
    pendingOvertimeMinutes: number;
    workMinor: number;
    expensesMinor: number;
    discountMinor: number;
    correctionsMinor: number;
    totalMinor: number;
  };
}

export interface WorkPayoutPeriodDto {
  /** `null` у идущего периода — в базе его ещё нет. */
  id: string | null;
  fromDay: string;
  toDay: string;
  status: WorkPayoutStatus;
  /**
   * Итог: у идущего — на сейчас, у подбитого — замороженный. Смотрящему без
   * доступа к деньгам доски — только его строка в `people`, задачи без сумм.
   */
  snapshot: WorkPayoutSnapshot;
  closedAt: string | null;
  sentAt: string | null;
  paidAt: string | null;
  paidNote: string;
}

export interface WorkPayoutsDto {
  currency: WorkCurrency;
  period: WorkPayoutPeriodKind;
  payoutDay: number;
  /** Ведущий или администрация: подбивают, отмечают отправку и оплату. */
  canManage: boolean;
  current: WorkPayoutPeriodDto;
  /** Подбитые, свежие первыми. */
  closed: WorkPayoutPeriodDto[];
}

export interface MarkWorkPayoutRequest {
  status: 'sent' | 'paid';
  note?: string;
}

