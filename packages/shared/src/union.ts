// Типы сервиса VedaMatch Union. См. docs/service-module-contract.md
import type { Gender, SpiritualStage } from './index';
import type { ProfileMessengers, ProfileSocialLinks } from './index';

export type UnionIntentionType = 'family' | 'business' | 'friendship' | 'service';

export type UnionFormat = 'online' | 'offline' | 'any';

export type UnionConnectionStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export type UnionVisibilityLevel = 'everyone' | 'after_match' | 'hidden';

/** Огрублённая активность: точное время последнего визита наружу не отдаём. */
export type UnionActivityLevel = 'online' | 'today' | 'week' | 'long_ago';

export interface UnionPrivacySettings {
  photo?: UnionVisibilityLevel;
  age?: UnionVisibilityLevel;
  city?: UnionVisibilityLevel;
  contacts?: UnionVisibilityLevel;
}

export interface UnionIntentionDto {
  type: UnionIntentionType;
  /** 0..100, сумма по профилю = 100 */
  weight: number;
}

/** Питание. Заменяет вопросы «алкоголь/курение» из массовых анкет. */
export type UnionDiet =
  | 'vegetarian'
  | 'vegan'
  | 'prasadam_only'
  | 'transitioning'
  | 'not_vegetarian';

/**
 * Четыре регулирующих принципа. Пустой список означает «не указано»,
 * а не «не соблюдаю ничего».
 */
export type UnionRegulativePrinciple =
  | 'no_meat'
  | 'no_intoxicants'
  | 'no_gambling'
  | 'no_illicit_sex';

export type UnionChildrenStatus =
  | 'none_want'
  | 'none_not_want'
  | 'none_undecided'
  | 'have_living_with'
  | 'have_living_apart';

export type UnionEducationLevel =
  | 'school'
  | 'vocational'
  | 'incomplete_higher'
  | 'higher'
  | 'academic_degree';

export type UnionSpiritualEducation =
  | 'none'
  | 'temple_courses'
  | 'bhakti_shastri'
  | 'bhakti_vaibhava'
  | 'bhakti_vedanta'
  | 'other';

export type UnionHousing =
  | 'own_place'
  | 'rent'
  | 'with_parents'
  | 'with_relatives'
  | 'community'
  | 'temple_ashram';

/** Материальная обеспеченность: опционально и закрывается приватностью. */
export type UnionIncomeLevel =
  | 'basic_needs_hard'
  | 'basic_needs'
  | 'basic_and_rest'
  | 'comfortable'
  | 'prefer_not_say';

/** Блок «О себе»: все поля опциональны и заполняются постепенно. */
export interface UnionProfileDetails {
  status: string | null;
  heightCm: number | null;
  diet: UnionDiet | null;
  regulativePrinciples: UnionRegulativePrinciple[];
  childrenStatus: UnionChildrenStatus | null;
  education: UnionEducationLevel | null;
  spiritualEducation: UnionSpiritualEducation | null;
  housing: UnionHousing | null;
  income: UnionIncomeLevel | null;
  pets: string[];
  /** Желаемый возраст партнёра */
  ageRangeMin: number | null;
  ageRangeMax: number | null;
}

export interface UnionProfileDto extends UnionProfileDetails {
  id: string;
  userId: string;
  about: string | null;
  relocationReady: boolean;
  format: UnionFormat;
  languages: string[];
  skills: string[];
  interests: string[];
  values: string[];
  familyStatus: string | null;
  privacy: UnionPrivacySettings | null;
  isActive: boolean;
  /**
   * Согласие показывать анкету на публичной витрине Знакомств — странице
   * сервиса, открытой гостям и поисковикам. Отдельно от `privacy`: та
   * настройка открывает данные участникам портала, а не всему интернету,
   * и «everyone» в ней такого согласия не заменяет.
   */
  showcaseOptIn: boolean;
  /**
   * Администрация сняла анкету с витрины. Согласие человека при этом
   * сохраняется: если снятие было ошибкой, заново его спрашивать не нужно.
   */
  showcaseBlocked: boolean;
  /** Принимать запросы только от преданных, подтверждённых администрацией */
  requestsFromVerifiedOnly: boolean;
  /** Кто может начать общение: заявки от всех или только взаимные лайки */
  contactMode: UnionContactMode;
  /**
   * Кого искать при цели «Создание семьи». `null` — пол не важен. Сужение
   * работает в обе стороны и только пока цель «Создание семьи» отмечена.
   */
  familySeeksGender: Gender | null;
  intentions: UnionIntentionDto[];
  createdAt: string;
  updatedAt: string;
}

/** Ключи полей, из которых складывается прогресс заполнения анкеты. */
export type UnionProfileFieldKey =
  | 'photos'
  | 'about'
  | 'status'
  | 'intentions'
  | 'languages'
  | 'interests'
  | 'values'
  | 'skills'
  | 'familyStatus'
  | 'childrenStatus'
  | 'diet'
  | 'regulativePrinciples'
  | 'ageRange'
  | 'heightCm'
  | 'education'
  | 'spiritualEducation'
  | 'housing'
  | 'income'
  | 'pets';

export interface UnionProfileCompletenessItem {
  key: UnionProfileFieldKey;
  /** Вклад поля в итоговый процент */
  weight: number;
  filled: boolean;
}

export interface UnionProfileCompleteness {
  /** 0..100 */
  percent: number;
  items: UnionProfileCompletenessItem[];
  /** Незаполненные поля, от самого весомого к наименее весомому */
  missing: UnionProfileFieldKey[];
  /** Что предложить заполнить следующим; null — анкета заполнена */
  next: UnionProfileFieldKey | null;
}

export interface UnionProfileState {
  profile: UnionProfileDto | null;
  completeness: UnionProfileCompleteness;
}

/** Поля анкеты, которые можно сгенерировать нейросетью по данным профиля. */
export type UnionGenerableField = 'status' | 'about';

export interface UnionGenerateTextRequest {
  field: UnionGenerableField;
}

export interface UnionGenerateTextResponse {
  text: string;
}

export interface UnionProfileUpdateRequest extends Partial<UnionProfileDetails> {
  about?: string | null;
  relocationReady?: boolean;
  format?: UnionFormat;
  languages?: string[];
  skills?: string[];
  interests?: string[];
  values?: string[];
  familyStatus?: string | null;
  privacy?: UnionPrivacySettings | null;
  isActive?: boolean;
  showcaseOptIn?: boolean;
  requestsFromVerifiedOnly?: boolean;
  contactMode?: UnionContactMode;
  familySeeksGender?: Gender | null;
  intentions: UnionIntentionDto[];
}

/**
 * Режим знакомства. `requests` — односторонний лайк приходит человеку заявкой,
 * он отвечает вручную. `mutual_only` — заявка появляется только при взаимном
 * лайке, односторонние интересующиеся не показываются.
 */
export type UnionContactMode = 'requests' | 'mutual_only';

export type UnionSwipeDecision = 'like' | 'superlike' | 'pass';

export interface UnionSwipeRequest {
  toUserId: string;
  decision: UnionSwipeDecision;
  /** Сопроводительное сообщение к заявке; для `pass` игнорируется. */
  message?: string | null;
}

export interface UnionSwipeResult {
  toUserId: string;
  decision: UnionSwipeDecision;
  /** Лайк оказался взаимным — чат уже открыт. */
  matched: boolean;
  /** Заявка, если она создана. У `pass` и у `mutual_only` без взаимности — null. */
  connection: UnionConnectionRequestDto | null;
}

/** Строка в списке диалогов. */
export interface UnionChatSummary {
  /** id принятой заявки — он же id чата. */
  requestId: string;
  user: UnionUserSummary;
  /** Последнее сообщение или null, если ещё не переписывались. */
  lastMessage: string | null;
  lastMessageAt: string | null;
  /** Последнее сообщение отправил я. */
  lastMessageMine: boolean;
  unreadCount: number;
}

export interface UnionChatsState {
  chats: UnionChatSummary[];
  /** Сумма непрочитанных по всем диалогам — для точки на вкладке. */
  unreadTotal: number;
}

/** Состояние буста «Внимание». */
export interface UnionBoostStatus {
  active: boolean;
  /** Когда закончится; null — буст не активен. */
  expiresAt: string | null;
  /** Сколько секунд осталось; 0 — буст не активен. */
  secondsLeft: number;
  /** Сколько минут длится буст — для текста в интерфейсе. */
  durationMinutes: number;
}

export interface UnionSwipeUndoResult {
  /** Кого вернули в колоду. */
  toUserId: string;
  decision: UnionSwipeDecision;
}

/**
 * Результат полного сброса истории показов — отдельного действия от сброса
 * фильтров: фильтры сужают выдачу, а история решает, кто уже был отсмотрен.
 */
export interface UnionSwipeResetResult {
  /** Сколько анкет вернулось в колоду. Уже состоявшиеся мэтчи не считаются. */
  restoredCount: number;
}

export type UnionCompatibilityCriterion =
  | 'intentions'
  | 'stage'
  /** Питание и регулирующие принципы */
  | 'lifestyle'
  | 'interests'
  | 'values'
  | 'location'
  | 'format';

export interface UnionCompatibilityBreakdownItem {
  criterion: UnionCompatibilityCriterion;
  /** Вес критерия в итоговой оценке, % */
  weight: number;
  /** Оценка по критерию, 0..100 */
  score: number;
}

export interface UnionCompatibility {
  /** Итоговый процент совместимости, 0..100 */
  total: number;
  breakdown: UnionCompatibilityBreakdownItem[];
}

export interface UnionPhoto {
  id: string;
  url: string;
  width: number;
  height: number;
}

export interface UnionUserSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
  photos: UnionPhoto[];
  city: string | null;
  country: string | null;
  spiritualStage: SpiritualStage | null;
  /** Полных лет; null, если возраст не указан или скрыт приватностью. */
  age: number | null;
  /** Активность профиля; null, если человек ни разу не заходил. */
  activity: UnionActivityLevel | null;
  /**
   * Время последнего визита, ISO. Отдаётся только для свежих визитов — тех,
   * что уложились в неделю; у остальных null, как и раньше был только
   * огрублённый уровень.
   */
  lastSeenAt: string | null;
  /** Преданный, чей статус подтвердила администрация. */
  isVerifiedDevotee: boolean;
  /** Администрация сверила публичные фото с живым человеком. */
  isPhotoVerified: boolean;
  contacts: UnionVisibleContacts | null;
}

export interface UnionVisibleContacts {
  socialLinks: ProfileSocialLinks;
  messengers: ProfileMessengers;
}

export interface UnionRecommendation {
  user: UnionUserSummary;
  profile: Pick<
    UnionProfileDto,
    'about' | 'format' | 'relocationReady' | 'languages' | 'skills' | 'interests' | 'values'
  > &
    UnionProfileDetails & { intentions: UnionIntentionDto[] };
  compatibility: UnionCompatibility;
  connection: UnionConnectionSummary | null;
  /**
   * Моё действующее решение по этой анкете, если оно есть. Нужно там, где
   * выдача намеренно показывает уже отсмотренных: без пометки человек решает
   * второй раз вслепую, не помня, что запрос он уже отправил.
   */
  myDecision: UnionSwipeDecision | null;
}

export interface UnionRecommendationFilters {
  /** @deprecated Одна цель. Оставлено ради сохранённых ссылок на выдачу. */
  intention?: UnionIntentionType;
  /** Цели через ИЛИ: анкета проходит, если несёт хотя бы одну из них. */
  intentions?: UnionIntentionType[];
  city?: string;
  country?: string;
  lat?: number;
  lon?: number;
  radiusKm?: number;
  stage?: SpiritualStage;
  /** Профили без указанного пола не проходят явно заданный фильтр. */
  gender?: Gender;
  ageMin?: number;
  ageMax?: number;
  /** Профили без указанного питания не проходят явно заданный фильтр. */
  diet?: UnionDiet;
  /** Сколько регулирующих принципов человек соблюдает как минимум, 1..4. */
  principlesMin?: number;
  childrenStatus?: UnionChildrenStatus;
  /** Показывать только преданных, подтверждённых администрацией. */
  verifiedOnly?: boolean;
  /** Показывать только профили с проверенными фото. */
  photoVerifiedOnly?: boolean;
  /** Не исключать из выдачи анкеты, которые уже свайпнули (лайк/пропуск). */
  includeSwiped?: boolean;
  /**
   * «Показать всех»: снимает всё, что сужает выдачу молча, — историю показов,
   * желаемый возраст партнёра из анкеты, отбор по полу под целью «Создание
   * семьи» с обеих сторон и неполную геометку кандидата. Остаются только
   * фильтры, выбранные на экране, и явно скрытое: блокировки, модерация,
   * архив. «Все» значит все — иначе слово означало бы у каждого своё число.
   */
  showAll?: boolean;
  format?: UnionFormat;
  language?: string;
  /** Порядок выдачи: по совместимости (по умолчанию) или сначала новые анкеты. */
  sort?: UnionRecommendationSort;
  /** Нижняя граница совместимости в процентах, 1..100. */
  minScore?: number;
  page?: number;
  pageSize?: number;
}

export type UnionRecommendationSort = 'match' | 'new';

/**
 * Сколько анкет вернулось бы по каждой цели при тех же остальных фильтрах.
 * `all` — размер выдачи без фильтра целей. Анкета с тремя целями попадает в
 * три счётчика, поэтому сумма по целям больше `all` — это верно для ИЛИ.
 */
export type UnionIntentionCounts = Record<UnionIntentionType, number> & {
  all: number;
};

export interface UnionRecommendationsResponse {
  items: UnionRecommendation[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  intentionCounts: UnionIntentionCounts;
}

export interface UnionConnectionSummary {
  id: string;
  status: UnionConnectionStatus;
  direction: 'incoming' | 'outgoing';
  /** Заявка отправлена суперлайком. */
  isSuperlike: boolean;
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
}

export interface UnionConnectionRequestDto extends UnionConnectionSummary {
  user: UnionUserSummary;
}

export interface UnionConnectionRequestsState {
  incoming: UnionConnectionRequestDto[];
  outgoing: UnionConnectionRequestDto[];
}

export interface UnionConnectionCounts {
  incomingPending: number;
}

export interface UnionCreateConnectionRequest {
  toUserId: string;
  message?: string | null;
  /** Отправить суперлайком; расходует суточную квоту. */
  isSuperlike?: boolean;
}

/** Сгруппированная реакция на сообщение: эмодзи + сколько раз и ставил ли я. */
export interface UnionMessageReactionSummary {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface UnionChatMessageDto {
  id: string;
  requestId: string;
  fromUserId: string;
  body: string;
  mine: boolean;
  createdAt: string;
  /** Когда сообщение было отредактировано; null — не редактировалось. */
  editedAt: string | null;
  reactions: UnionMessageReactionSummary[];
}

export interface UnionChatState {
  connection: UnionConnectionSummary;
  otherUser: UnionUserSummary;
  messages: UnionChatMessageDto[];
}

export interface UnionSendChatMessageRequest {
  body: string;
}

export interface UnionEditChatMessageRequest {
  body: string;
}

export interface UnionSetReactionRequest {
  emoji: string;
}

// ===== Админка Union =====

/** Строка в списке анкет админки: столько, сколько нужно, чтобы выбрать. */
export interface UnionAdminProfileListItem {
  userId: string;
  /** Мирское имя: админка смотрит на человека, а не на подпись. */
  name: string;
  email: string;
  spiritualStage: SpiritualStage | null;
  city: string | null;
  isActive: boolean;
  /** Аккаунт заблокирован администрацией — анкета и так не показывается. */
  accountBlocked: boolean;
  /** Открытых жалоб на человека. */
  openReports: number;
  photosCount: number;
  /** Состояние публичной витрины: согласие человека и решение администрации. */
  showcase: UnionAdminShowcaseState;
  lastSeenAt: string | null;
  updatedAt: string;
}

/**
 * `off` — согласия нет; `on` — человек согласился и анкета на витрине;
 * `blocked` — согласие есть, но администрация сняла анкету с витрины.
 */
export type UnionAdminShowcaseState = 'off' | 'on' | 'blocked';

export interface UnionAdminProfileListResponse {
  items: UnionAdminProfileListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Что видно администрации в анкете. Без фильтра приватности: настройки
 *  показываются как факт, а не применяются — иначе жалобу не разобрать. */
export interface UnionAdminProfileDto extends UnionAdminProfileListItem {
  about: string | null;
  /**
   * Пол из портального `User`, только на просмотр: анкета его не хранит, и
   * правится он в карточке аккаунта — см. docs/service-module-contract.md.
   */
  gender: Gender | null;
  status: string | null;
  format: UnionFormat;
  languages: string[];
  skills: string[];
  interests: string[];
  values: string[];
  familyStatus: string | null;
  intentions: UnionIntentionDto[];
  privacy: UnionPrivacySettings | null;
  requestsFromVerifiedOnly: boolean;
  contactMode: UnionContactMode;
  createdAt: string;
  /** Активность в сервисе — по ней видно, живая анкета или брошенная. */
  activity: {
    swipesMade: number;
    likesReceived: number;
    requestsSent: number;
    requestsReceived: number;
    matches: number;
  };
}

export interface UnionAdminProfileQuery {
  /** Поиск по имени или почте. */
  q?: string;
  /** `active` — в выдаче, `hidden` — снята с выдачи. */
  visibility?: 'all' | 'active' | 'hidden';
  /** Только те, на кого есть открытые жалобы. */
  reportedOnly?: boolean;
  /** Отбор по состоянию публичной витрины. */
  showcase?: 'all' | UnionAdminShowcaseState;
  page?: number;
  pageSize?: number;
}

export interface UnionAdminHideProfileRequest {
  /** Причина обязательна: анкету снимают с выдачи, человек об этом узнает. */
  reason: string;
}

/** Сводка по сервису знакомств для админки. */
export interface UnionAdminStats {
  profiles: { total: number; active: number; hidden: number };
  /** За последние 7 дней. */
  week: { swipes: number; likes: number; requests: number };
  matches: { total: number; pending: number };
  boostsActive: number;
}

export const UNION_ADMIN_HIDE_REASON_MIN_LENGTH = 5;

/** Анкета, убранная в архив: в выдачу не возвращается, пока не вернут вручную. */
export interface UnionArchiveEntry {
  user: UnionUserSummary;
  /** Когда убрали, ISO. */
  archivedAt: string;
}

export interface UnionArchiveListResponse {
  items: UnionArchiveEntry[];
}

/**
 * Итог нового круга. `restoredCount` — сколько пропусков снято; лайки,
 * суперлайки и архив не входят, они переживают начало круга.
 */
export interface UnionCycleResetResult {
  restoredCount: number;
}

/**
 * Избранные среди входящих лайков — личная отметка «этот особенно
 * понравился». Наружу отдаются только id: карточки рисуются из уже
 * загруженных заявок, а лишние данные о людях здесь ни к чему.
 */
export interface UnionFavoritesResponse {
  userIds: string[];
}

// ===== Публичная витрина Знакомств =====

/**
 * Карточка витрины на публичной странице сервиса. Её видят гости и
 * поисковики, поэтому здесь только то, что человек согласился показать
 * всему интернету: он поставил `showcaseOptIn`, а каждое отдельное поле
 * дополнительно прошло его же настройку приватности на уровне «everyone».
 *
 * Процента совместимости здесь нет намеренно: он считается относительно
 * смотрящего, а у гостя анкеты нет — нарисованное число рядом с настоящим
 * лицом было бы враньём.
 */
export interface UnionShowcaseCard {
  id: string;
  name: string;
  age: number | null;
  city: string | null;
  country: string | null;
  about: string | null;
  photoUrl: string;
  interests: string[];
}

export interface UnionShowcaseResponse {
  cards: UnionShowcaseCard[];
}
