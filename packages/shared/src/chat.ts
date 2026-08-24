/** Сервис «Общение»: личные диалоги, группы и каналы общин. */

import type { CommunityStatus } from './community';

export type ChatConversationKind = 'direct' | 'group' | 'channel';

export type ChatConversationState =
  | 'request'
  | 'active'
  | 'declined'
  | 'archived';

export type ChatMemberRole = 'owner' | 'admin' | 'member';

/** Открытая беседа видна в каталоге общины и пускает к себе сама. */
export type ChatConversationVisibility = 'public' | 'private';

export type ChatAttachmentKind =
  | 'image'
  | 'file'
  | 'voice'
  | 'story'
  | 'notice'
  | 'listing'
  | 'contact';

/** Столько же, сколько было в чате Знакомств: длину переписки меняли бы вместе. */
export const CHAT_MESSAGE_MAX_LENGTH = 2000;

/** Не больше вложений в одном сообщении — иначе лента превращается в альбом. */
export const CHAT_MAX_ATTACHMENTS = 10;

/**
 * Разрешённые эмодзи реакций — узкий белый список вместо любых строк.
 * Список повторяет чат Знакомств; дублирование намеренное: контракт
 * сервисного модуля запрещает тянуть константы из чужого модуля.
 */
export const CHAT_REACTION_EMOJIS = [
  '❤️',
  '🙏',
  '😂',
  '😍',
  '👍',
  '🔥',
  '🌸',
  '🙌',
] as const;

export type ChatReactionEmoji = (typeof CHAT_REACTION_EMOJIS)[number];

export interface ChatUserSummary {
  id: string;
  /** Уже разрешённое имя: духовное, если оно есть. */
  name: string;
  avatarUrl?: string | null;
  /**
   * Когда человек последний раз был на портале. Точность до пяти минут —
   * столько же, сколько пишет AuthGuard; наружу идёт время, а «в сети» или
   * «был недавно» решает уже интерфейс.
   */
  lastSeenAt?: string | null;
}

export interface ChatAttachmentDto {
  id: string;
  kind: ChatAttachmentKind;
  url?: string | null;
  previewUrl?: string | null;
  /** Снимок карточки чужого сервиса: заголовок, подпись и текст. */
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  /** Только чтобы дать ссылку «открыть оригинал». */
  sourceService?: string | null;
  sourceId?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  /** Уровни 0..100 для дорожки голосового. */
  waveform?: number[];
}

export interface ChatReactionSummary {
  emoji: string;
  count: number;
  /** Поставил ли реакцию тот, кто смотрит. */
  mine: boolean;
}

/** Цитата в ответе: столько, сколько нужно нарисовать, без похода за оригиналом. */
export interface ChatReplyPreview {
  id: string;
  authorName: string;
  body: string;
  /** Есть ли у оригинала вложение — в цитате рисуется значком. */
  attachmentKind?: ChatAttachmentKind | null;
}

export interface ChatMessageDto {
  id: string;
  conversationId: string;
  author: ChatUserSummary;
  body: string;
  replyTo?: ChatReplyPreview | null;
  attachments: ChatAttachmentDto[];
  reactions: ChatReactionSummary[];
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  /** Прочитано ли собеседником — считается только для своих сообщений. */
  readByOthers?: boolean;
  /** Сколько человек открыли пост канала. */
  viewsCount?: number;
  /** Сколько комментариев под постом канала. */
  commentsCount?: number;
  /** Имя автора исходного сообщения, если это пересылка. */
  forwardedFrom?: string | null;
}

export interface ChatMemberDto {
  user: ChatUserSummary;
  role: ChatMemberRole;
  joinedAt: string;
  lastReadAt?: string | null;
}

export interface ChatCommunityRef {
  id: string;
  slug: string;
  name: string;
}

export interface ChatConversationSummary {
  id: string;
  kind: ChatConversationKind;
  state: ChatConversationState;
  visibility: ChatConversationVisibility;
  /** Заголовок: имя собеседника, название группы или канала. */
  title: string;
  avatarUrl?: string | null;
  /** Собеседник личного диалога — для аватара и статуса. */
  companion?: ChatUserSummary | null;
  community?: ChatCommunityRef | null;
  membersCount: number;
  unreadCount: number;
  muted: boolean;
  pinned: boolean;
  /** Может ли смотрящий писать сюда прямо сейчас. */
  canWrite: boolean;
  lastMessage?: ChatMessageDto | null;
  lastMessageAt?: string | null;
}

export interface ChatConversationDetail extends ChatConversationSummary {
  /** Закреплённое сообщение — одно на беседу, показывается под шапкой. */
  pinnedMessage?: ChatMessageDto | null;
  description?: string | null;
  members: ChatMemberDto[];
  messages: ChatMessageDto[];
  /** Есть ли более старые сообщения за пределами страницы. */
  hasMore: boolean;
  /** Моя роль: от неё зависит право писать в канал и звать в группу. */
  myRole: ChatMemberRole;
}

/** Сколько непрочитанного во всём сервисе — для значка на плитке. */
export interface ChatUnreadState {
  /** Сумма непрочитанных сообщений по всем беседам. */
  messages: number;
  /** Сколько бесед ждут ответа. */
  conversations: number;
  /** Запросы на переписку считаются отдельно: это другое действие. */
  requests: number;
}

export interface ChatListState {
  conversations: ChatConversationSummary[];
  /** Сколько запросов ждёт ответа — для плашки над списком. */
  requestsCount: number;
}

export interface ChatRequestSummary {
  conversation: ChatConversationSummary;
  from: ChatUserSummary;
  message?: ChatMessageDto | null;
  createdAt: string;
  /**
   * Профиль без фото и без общин: такой запрос показывается свёрнутым,
   * пока человек сам не откроет.
   */
  lowTrust: boolean;
}

export interface ChatRequestsState {
  requests: ChatRequestSummary[];
}

export interface ChatAttachmentInput {
  kind: ChatAttachmentKind;
  url?: string;
  key?: string;
  previewUrl?: string;
  title?: string;
  subtitle?: string;
  body?: string;
  sourceService?: string;
  sourceId?: string;
  mimeType?: string;
  sizeBytes?: number;
  durationSec?: number;
  width?: number;
  height?: number;
  waveform?: number[];
}

export interface SendChatMessageRequest {
  body?: string;
  replyToId?: string;
  attachments?: ChatAttachmentInput[];
}

export interface EditChatMessageRequest {
  body: string;
}

export interface SetChatReactionRequest {
  emoji: string;
}

export interface CreateChatConversationRequest {
  kind: ChatConversationKind;
  /** Открытая беседа видна в каталоге общины; по умолчанию закрытая. */
  visibility?: ChatConversationVisibility;
  /** Личный диалог: с кем. */
  userId?: string;
  /** Группа и канал: как называется и кто внутри. */
  title?: string;
  description?: string;
  memberIds?: string[];
  /** Канал или группа: чья община. */
  communityId?: string;
}

/** Найденное сообщение вместе с беседой, где оно лежит. */
export interface ChatSearchHit {
  message: ChatMessageDto;
  conversation: ChatConversationSummary;
}

/** Пост канала со своими комментариями. */
export interface ChatThreadState {
  post: ChatMessageDto;
  comments: ChatMessageDto[];
  /** Может ли смотрящий добавить комментарий. */
  canComment: boolean;
}

export interface ChatSearchState {
  hits: ChatSearchHit[];
  /** Обрезан ли ответ по пределу — чтобы честно сказать «показаны первые». */
  truncated: boolean;
}

/**
 * Точка на карте — община.
 *
 * Люди на карте есть, но иначе: не метка на человека, а метка на город со
 * счётчиком. В профиле указан город, а не адрес, и точка на публичной карте
 * у частного человека была бы другим уровнем раскрытия, чем он соглашался.
 * Поэтому на карту попадают только те, кто включил это сам
 * (`ContactsProfile.showOnMap`), и попадают числом, а не именем.
 */
export interface ChatMapCommunity {
  community: ChatCommunityRef;
  lat: number;
  lon: number;
  city?: string | null;
  /** Сколько у общины открытых каналов и групп. */
  channels: number;
  groups: number;
}

/** Город со счётчиком людей, согласившихся быть на общей карте. */
export interface ChatMapCity {
  city: string;
  country: string | null;
  lat: number;
  lon: number;
  /** Сколько человек согласились показываться отсюда. */
  people: number;
}

export interface ChatMapState {
  communities: ChatMapCommunity[];
  cities: ChatMapCity[];
}

/** Открытая беседа в каталоге: то, на что можно подписаться самому. */
export interface ChatDiscoverItem {
  conversation: ChatConversationSummary;
  /** Уже состою — тогда вместо «подписаться» ведём внутрь. */
  joined: boolean;
}

export interface ChatDiscoverState {
  items: ChatDiscoverItem[];
}

/** Община, в которой смотрящий вправе завести канал. */
export interface ChatChannelCommunity {
  /**
   * `status` тут не для витрины, а чтобы владелец видел: если она не
   * `active`, ссылка на неё нигде публично не появится — молчаливая пропажа
   * хуже честного предупреждения в форме создания.
   */
  community: ChatCommunityRef & { status: CommunityStatus };
  /** Уже заведённые каналы этой общины — второй такой же обычно не нужен. */
  channels: { id: string; title: string }[];
}

export interface ChatChannelCommunitiesState {
  communities: ChatChannelCommunity[];
}

export interface CreateChatReportRequest {
  reason: string;
  comment?: string;
  messageId?: string;
  conversationId?: string;
}

export interface ChatUploadResult {
  kind: ChatAttachmentKind;
  url: string;
  key: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

/**
 * События потока `GET /chat/stream`. Поток самодостаточен: подписчику
 * не нужно ходить за недостающим отдельным запросом.
 */
export type ChatStreamEvent =
  | { type: 'message.created'; conversationId: string; message: ChatMessageDto }
  | { type: 'message.updated'; conversationId: string; message: ChatMessageDto }
  | { type: 'message.deleted'; conversationId: string; messageId: string }
  | {
      type: 'reaction.set';
      conversationId: string;
      messageId: string;
      reactions: ChatReactionSummary[];
    }
  | {
      type: 'read';
      conversationId: string;
      userId: string;
      lastReadAt: string;
    }
  | { type: 'typing'; conversationId: string; user: ChatUserSummary }
  | {
      type: 'conversation.upserted';
      conversation: ChatConversationSummary;
    }
  | {
      /** Беседу удалил владелец: её надо убрать из списка, а не открывать. */
      type: 'conversation.removed';
      conversationId: string;
    }
  | {
      /** Закрепили или сняли закрепление: `message` = null — сняли. */
      type: 'pinned';
      conversationId: string;
      message: ChatMessageDto | null;
    };

/** Раздел админки: жалоба на сообщение или беседу. */
export interface AdminChatReportDto {
  id: string;
  reason: string;
  comment?: string | null;
  status: 'open' | 'resolved' | 'rejected';
  createdAt: string;
  reporter: ChatUserSummary;
  conversationId?: string | null;
  conversationTitle?: string | null;
  conversationKind?: ChatConversationKind | null;
  messageId?: string | null;
  messageBody?: string | null;
  messageAuthor?: ChatUserSummary | null;
  decision?: string | null;
  decidedAt?: string | null;
}

export interface AdminChatReportsState {
  reports: AdminChatReportDto[];
  openCount: number;
}

export interface AdminChatReportDecisionRequest {
  /** `resolve` прячет сообщение, `reject` оставляет как есть. */
  action: 'resolve' | 'reject';
  comment?: string;
}

/** Строка беседы в админке: без переписки, только то, чем управляют. */
export interface AdminChatConversationDto {
  id: string;
  kind: ChatConversationKind;
  state: ChatConversationState;
  title: string;
  membersCount: number;
  messagesCount: number;
  lastMessageAt?: string | null;
  createdAt: string;
  communityName?: string | null;
}

export interface AdminChatConversationsState {
  conversations: AdminChatConversationDto[];
}

/**
 * Переписка двоих для разбора жалобы.
 *
 * Раньше её показывала админка Знакомств из своих таблиц. Переписка переехала
 * в «Общение», и читать её из чужого модуля Знакомствам нельзя — поэтому
 * возможность живёт здесь, у владельца данных, вместе со своим журналом
 * просмотров.
 */
export interface AdminChatDirectMessageDto {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  attachments: number;
}

export interface AdminChatDirectTranscript {
  conversationId: string | null;
  messages: AdminChatDirectMessageDto[];
}

export interface AdminChatStats {
  conversations: number;
  directConversations: number;
  groups: number;
  channels: number;
  messages: number;
  messagesLast7Days: number;
  openReports: number;
}

/**
 * Конструктор цвета чата: именованные шаблоны оформления переписки.
 * Приватная настройка просмотра — см. docs/superpowers/specs/2026-08-23-chat-color-templates-design.md.
 */
export const CHAT_COLOR_HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
export const CHAT_COLOR_TEMPLATE_MAX_NAME_LENGTH = 40;

export interface ChatColorTemplateDto {
  id: string;
  name: string;
  bubbleMine: string;
  bubbleTheirs: string;
  accent: string;
  background: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatColorTemplatesState {
  templates: ChatColorTemplateDto[];
}

export interface SaveChatColorTemplateRequest {
  name: string;
  bubbleMine: string;
  bubbleTheirs: string;
  accent: string;
  background: string;
}

/** `templateId: null` — оформление по умолчанию. */
export interface ChatConversationThemeState {
  templateId: string | null;
}

export interface SetChatConversationThemeRequest {
  templateId: string | null;
}
