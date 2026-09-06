/**
 * Ассистент портала: переписка с ИИ, который знает все сервисы VedaMatch.
 *
 * Ассистент — портальная инфраструктура, а не сервис каталога: у него нет
 * своих данных о людях, он лишь спрашивает сервисы через шину событий и
 * собирает ответы в карточки. Типы здесь не зависят от типов сервисов —
 * карточка описывает найденное общими словами (заголовок, подпись, ссылка).
 */

/** Ссылка на найденное в сервисе: товар, цитата, запись, трек, стих. */
export interface AssistantLinkCard {
  kind: 'link';
  /** Слаг сервиса-источника: `market`, `motivation`, `library`… */
  service: string;
  title: string;
  subtitle: string | null;
  body: string | null;
  imageUrl: string | null;
  /** Относительный путь внутри портала. */
  href: string;
}

export type AssistantActionStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'failed';

/**
 * Действие, которое ассистент предложил, но не выполнил: публикация в
 * сервис делается только после явного «да» в чате. Аргументы хранятся в
 * карточке, чтобы подтверждение не зависело от памяти модели.
 */
export interface AssistantActionCard {
  kind: 'action';
  /** Имя инструмента, например `motivation.create_reel`. */
  action: string;
  /** Подпись кнопки подтверждения. */
  label: string;
  /** Что именно произойдёт — простым языком. */
  summary: string;
  args: Record<string, unknown>;
  status: AssistantActionStatus;
  /** Куда идти после выполнения; пусто, пока не выполнено. */
  resultHref: string | null;
  /** Итог выполнения или причина отказа. */
  resultText: string | null;
}

export type AssistantCard = AssistantLinkCard | AssistantActionCard;

export type AssistantMessageRole = 'user' | 'assistant';

export interface AssistantMessageDto {
  id: string;
  role: AssistantMessageRole;
  text: string;
  cards: AssistantCard[];
  /** Какие инструменты вызывались, чтобы собрать ответ. */
  toolsUsed: string[];
  /** Ответ не получился: провайдер молчал или упал. Текст — объяснение. */
  failed: boolean;
  createdAt: string;
}

export type AssistantThreadKind = 'chat' | 'compose';

export interface AssistantThreadDto {
  id: string;
  kind: AssistantThreadKind;
  /** Первые слова первого вопроса; пусто у только что созданной. */
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantThreadDetail {
  thread: AssistantThreadDto;
  messages: AssistantMessageDto[];
}

export interface AssistantQuotaState {
  /** Сколько вопросов ещё можно задать сегодня; 0 при выключенном лимите не значит «нельзя». */
  messagesLeft: number;
  /** 0 — без лимита. */
  messagesPerDay: number;
  /** Ассистент отвечает: включён, есть ключ, бюджет не исчерпан. */
  available: boolean;
  /** Общий дневной бюджет портала исчерпан — до конца суток ответов нет. */
  budgetHalted: boolean;
  /** Объяснение недоступности простым языком; пусто, когда всё работает. */
  unavailableReason: string | null;
}

export interface AssistantStateDto {
  enabled: boolean;
  /** Помощник в поле ввода «Общения» включён администратором. */
  chatHelperEnabled: boolean;
  quota: AssistantQuotaState;
  threads: AssistantThreadDto[];
}

export interface SendAssistantMessageRequest {
  text: string;
}

export interface SendAssistantMessageResponse {
  thread: AssistantThreadDto;
  userMessage: AssistantMessageDto;
  assistantMessage: AssistantMessageDto;
  quota: AssistantQuotaState;
}

export interface ConfirmAssistantActionRequest {
  messageId: string;
  /** Номер карточки в сообщении. */
  index: number;
  /** false — отказаться от действия. */
  confirm: boolean;
}

export interface ConfirmAssistantActionResponse {
  /** Сообщение с обновлённой карточкой. */
  message: AssistantMessageDto;
  /** Ответ ассистента о результате; пусто при отказе. */
  followUp: AssistantMessageDto | null;
}

/**
 * Помощник в переписке: человек просит составить или поправить сообщение
 * собеседнику, ассистент возвращает готовый текст без карточек.
 */
export interface AssistantComposeRequest {
  /** Просьба: «напиши вежливый отказ», «поправь орфографию: …». */
  text: string;
  /** Имя собеседника — чтобы обращение было по имени. */
  recipientName?: string | null;
  /** Последние реплики беседы для контекста, от старых к новым. */
  context?: string[];
}

export interface AssistantComposeResponse {
  text: string;
  quota: AssistantQuotaState;
}

// ===== Админка =====

export interface AssistantSettingsDto {
  /** Ассистент виден и отвечает. */
  enabled: boolean;
  /** Аварийный выключатель обращений к модели; страница остаётся, ответов нет. */
  aiEnabled: boolean;
  /** Кнопка ассистента в поле ввода «Общения». */
  chatHelperEnabled: boolean;
  /** Ассистент может предлагать действия (публикацию во Вдохновение). */
  actionsEnabled: boolean;
  /** 0 — без лимита. */
  dailyMessagesPerUser: number;
  dailyTokensPerUser: number;
  dailyTokenBudget: number;
  /** 0 — денежный лимит не применяется. */
  dailyCostLimitUsdCents: number;
  /** Сколько раз подряд модель может звать инструменты в одном ответе. */
  maxToolRounds: number;
  /** Дополнение к системной инструкции: тон, запреты, акценты. */
  systemPromptExtra: string;
}

export type UpdateAssistantSettingsRequest = Partial<AssistantSettingsDto>;

export interface AssistantUsageDay {
  /** `YYYY-MM-DD`. */
  day: string;
  tokensIn: number;
  tokensOut: number;
  costUsdCents: number;
  halted: boolean;
}

export interface AssistantTopConsumer {
  userId: string;
  name: string;
  email: string;
  messages: number;
  tokens: number;
}

export interface AssistantToolStat {
  tool: string;
  service: string;
  calls: number;
  failures: number;
  avgDurationMs: number;
}

/** Как порталом пользуются через ассистента — за выбранный период. */
export interface AssistantMetrics {
  activeUsers: number;
  threads: number;
  /** Вопросов задано (сообщений от людей). */
  questions: number;
  /** Ответов не получилось. */
  failedAnswers: number;
  composeRequests: number;
  actionsProposed: number;
  actionsConfirmed: number;
  avgTokensPerAnswer: number;
  tools: AssistantToolStat[];
}

export interface AssistantAdminUsageDto {
  days: AssistantUsageDay[];
  today: {
    tokensIn: number;
    tokensOut: number;
    costUsdCents: number;
    halted: boolean;
  };
  /** Из окружения: пусто — ассистент не настроен. */
  model: string | null;
  configured: boolean;
  topConsumers: AssistantTopConsumer[];
  metrics: AssistantMetrics;
}

// ===== Шина событий: запрос ассистента к сервису и ответ =====

/**
 * Запрос инструмента. Ассистент шлёт событие `assistant.tool.<tool>`
 * (например `assistant.tool.market_search`), сервис-владелец отвечает
 * `AssistantToolReply` из своего слушателя. Ассистент не читает чужих таблиц:
 * всё, что попадёт в карточку, сервис отдаёт сам.
 */
export interface AssistantToolRequest {
  tool: string;
  args: Record<string, unknown>;
  /** Кто спрашивает: для персональных ответов и действий от его имени. */
  userId: string;
  /** Полный токен доступа — нужен действиям, где сервис проверяет права. */
  actor: { sub: string; email: string; role: string; adminServices?: string[] };
  /** Язык ответа, `ru` или `en`. */
  locale: string;
}

/** Найденное в сервисе — то, что станет карточкой-ссылкой. */
export interface AssistantToolItem {
  title: string;
  subtitle?: string | null;
  body?: string | null;
  imageUrl?: string | null;
  /** Относительный путь внутри портала. */
  href: string;
}

export interface AssistantToolReply {
  ok: boolean;
  /** Что показать человеку карточками. */
  items?: AssistantToolItem[];
  /** Что сказать модели и человеку словами: итог действия, причина отказа. */
  text?: string | null;
  /** Куда идти после действия. */
  href?: string | null;
}
