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
  | 'contact'
  /** Ответ ассистента портала, отправленный собеседнику снимком. */
  | 'assistant'
  /** Приглашение в рабочую среду сервиса «Работа». */
  | 'work'
  /** Карточка предложения из «Вакансий»: первое сообщение отклика. */
  | 'vacancy'
  /** Карточка объекта «Путешествий»: первое сообщение «Написать хозяину». */
  | 'stay'
  /** Запись о звонке в ленте диалога; создаёт только сервер. */
  | 'call';

/** Столько же, сколько было в чате Знакомств: длину переписки меняли бы вместе. */
export const CHAT_MESSAGE_MAX_LENGTH = 2000;

/** Не больше вложений в одном сообщении — иначе лента превращается в альбом. */
export const CHAT_MAX_ATTACHMENTS = 10;

/**
 * Быстрые реакции — строка сверху в меню сообщения. Остальные смайлики
 * открываются по «＋» (VED-122), и сервер пропускает любой один смайлик, а
 * не только эти восемь — см. `isSingleEmoji` в chat-validate. Список
 * повторяет чат Знакомств; дублирование намеренное: контракт сервисного
 * модуля запрещает тянуть константы из чужого модуля.
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

/**
 * «Избранные» смайлики в панели переписки (VED-123). Этот набор — пока
 * администрация не задала свой в админке чата. Каждый дальше правит свой
 * набор сам; он хранится на устройстве, как «Недавние».
 */
export const CHAT_DEFAULT_FAVORITE_EMOJIS = [
  '🙏',
  '❤️',
  '😊',
  '🌸',
  '🕉️',
  '✨',
  '👍',
  '😂',
] as const;

/** Сколько смайликов в избранном: четыре строки панели. */
export const CHAT_FAVORITE_EMOJI_MAX = 32;

/** Набор «Избранных» по умолчанию — каким его задала администрация. */
export interface ChatFavoriteEmojisDto {
  emojis: string[];
  /** `true` — администрация набор не задавала, отдан встроенный. */
  isBuiltIn: boolean;
}

export interface UpdateChatFavoriteEmojisRequest {
  /** Пустой список — вернуть встроенный набор. */
  emojis: string[];
}

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
  /** Официальный канал VedaMatch: один на портал, стоит первым в списке. */
  official: boolean;
  /** Может ли смотрящий писать сюда прямо сейчас. */
  canWrite: boolean;
  lastMessage?: ChatMessageDto | null;
  lastMessageAt?: string | null;
  /** О чём беседа, если её открыл другой сервис. null — обычная переписка. */
  context?: ChatConversationContext | null;
  /**
   * Идущий групповой звонок в этой беседе — id комнаты; `null`, когда
   * разговора нет. Поле в сводке, а не отдельная ручка: список бесед и так
   * запрашивается целиком, а «где сейчас говорят» — ровно то, ради чего в
   * этот список и смотрят. Живость считается по участникам: строка со
   * статусом `live`, в которой все перестали подтверждать присутствие,
   * звонком не считается.
   */
  activeGroupCallId?: string | null;
}

/**
 * Контекст беседы от другого сервиса. Пока единственный источник —
 * «Вакансии»: диалог по отклику помнит предложение и статус отклика, и
 * решение принимается прямо в переписке. Поля — снимок из события: Чат не
 * читает чужие таблицы.
 */
export interface ChatConversationContext {
  service: 'vacancies';
  /** Id в сервисе-источнике: для «Вакансий» — отклик. */
  id: string;
  title: string;
  /** Статус словом сервиса-источника; подписи собирает клиент. */
  status: string;
  meta: {
    offerId?: string;
    offerKind?: 'work' | 'seva' | 'task';
    /** Автор предложения — тот, кто принимает решение. */
    authorId?: string;
    responderId?: string;
  } | null;
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
  /**
   * Беседу завели быстрой конференцией — у неё есть ссылка-дверь, и в
   * комнате показывается панель со сроком и кнопками. Флаг, а не сам
   * `ChatConferenceDto`: подробности ссылки нужны одному экрану из
   * десятка, и тянуть их в каждую открытую переписку незачем.
   */
  isConference: boolean;
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

/**
 * Карта для гостя: то, что видно на публичной странице сервиса, до входа.
 *
 * Городов здесь нет намеренно. Община — организация, и её адрес публичен по
 * замыслу («у храма он публичный, в отличие от дома человека», см.
 * Community.address в схеме). Счётчик людей по городу — данные своих: человек
 * соглашался показываться участникам портала, а не всему интернету.
 */
export interface ChatPublicMapState {
  communities: ChatMapCommunity[];
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
    }
  | ChatCallStreamEvent
  | ChatGroupCallStreamEvent;

/** ICE-сервер в формате `RTCIceServer` — то, что уходит в `RTCPeerConnection`. */
export interface ChatIceServerDto {
  urls: string[];
  username?: string;
  credential?: string;
}

/** `GET /chat/calls/ice-servers`: STUN и TURN с короткоживущей учёткой. */
export interface ChatIceServersState {
  iceServers: ChatIceServerDto[];
  /** Сколько секунд живёт учётка TURN; 0 — TURN не настроен. */
  ttlSeconds: number;
  turnConfigured: boolean;
}

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
  /**
   * Последние сообщения переписки, по возрастанию времени. Именно последние:
   * жалоба всегда про недавнее, а начало долгого диалога к делу не относится.
   */
  messages: AdminChatDirectMessageDto[];
  /**
   * Показано не всё: сообщений больше предела. Модератор обязан это видеть —
   * молчаливая обрезка читается как «вот вся переписка».
   */
  truncated: boolean;
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

// ===== Звонки (docs/chat-calls-plan.md) =====

export type ChatCallKind = 'audio' | 'video';

/**
 * Состояние звонка. Переходы: ringing → accepted → ended | failed;
 * ringing → declined (вызываемый) | cancelled (звонивший) | missed (таймер).
 */
export type ChatCallStatus =
  | 'ringing'
  | 'accepted'
  | 'declined'
  | 'missed'
  | 'cancelled'
  | 'ended'
  | 'failed';

/** Почему звонок закончился — то, что клиент сообщает при завершении. */
export type ChatCallEndReason = 'hangup' | 'timeout' | 'network' | 'busy';

export interface ChatCallDto {
  id: string;
  conversationId: string;
  kind: ChatCallKind;
  status: ChatCallStatus;
  caller: ChatUserSummary;
  callee: ChatUserSummary;
  createdAt: string;
  answeredAt?: string | null;
  endedAt?: string | null;
  endReason?: ChatCallEndReason | null;
}

export interface StartChatCallRequest {
  conversationId: string;
  kind: ChatCallKind;
}

export interface EndChatCallRequest {
  reason?: ChatCallEndReason;
  /** Клиент знает по статистике соединения, шёл ли звук через TURN. */
  relayed?: boolean;
}

/**
 * Сигналинг WebRTC. Сервер содержимое не разбирает — переносит второй
 * стороне как есть. `sdp` — offer или answer, `candidate` — ICE.
 */
export type ChatCallSignal =
  | { kind: 'sdp'; sdp: { type: 'offer' | 'answer'; sdp: string } }
  | {
      kind: 'candidate';
      candidate: {
        candidate: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
      } | null;
    }
  /**
   * Состояние своей камеры (VED-291). WebRTC сам такого не сообщает:
   * `track.enabled = false` поток не разрывает — собеседник продолжает
   * получать кадры (чёрные) и не может отличить «камеру выключили» от
   * «картинка замёрзла». Поэтому факт сообщается явным сигналом; он же
   * переживает перезапуск ICE, потому что отправляется заново на каждом
   * `connected`.
   *
   * Обратная совместимость: клиент, который про этот вид не знает (сайт до
   * своей правки, старая сборка приложения), в `handleSignal` доходит до
   * ветки кандидата, видит `signal.candidate === undefined` и молча
   * выходит — ни исключения, ни изменения поведения. Отсутствие сигнала
   * трактуется получателем как «камера включена», то есть ровно как было.
   *
   * `candidate?: never` — не украшение. Код, написанный до этого варианта,
   * разбирает сигнал как «либо sdp, либо всё остальное — кандидат» и читает
   * `signal.candidate` после того, как ветка `sdp` вышла (ровно так написан
   * `apps/web/src/components/chat/calls/webrtc-session.ts`). Без этого поля
   * такой разбор перестал бы компилироваться, а с ним — и компилируется, и
   * ведёт себя правильно: `undefined` попадает в ветку «конец сбора
   * кандидатов», то есть в тихий `return`, чего мы от незнающего клиента и
   * хотим. Значение `never` при этом не даёт никому положить сюда
   * настоящего кандидата.
   */
  | { kind: 'media'; media: { video: boolean }; candidate?: never };

export interface ChatCallSignalRequest {
  signal: ChatCallSignal;
  /**
   * Идемпотентный ключ ОДНОГО сигнала (VED-261, feedback-002): клиент
   * генерирует его один раз, до первой попытки отправки, и посылает тот же
   * ключ во всех повторах (`sendWithRetry`/`SignalSendQueue`) — партиальный
   * успех («сервер сохранил, ответ потерялся») не должен породить второй
   * сигнал с новым `seq`. Необязательное поле — обратная совместимость:
   * без него сервер обрабатывает сигнал как раньше, без дедупликации по
   * повтору (только по `seq` на приёме, как и было).
   */
  clientSignalId?: string;
}

/** `GET /chat/calls/active`: звонок, в котором человек прямо сейчас. */
export interface ChatActiveCallState {
  call: ChatCallDto | null;
}

/** События звонков в общем потоке `GET /chat/stream`. */
export type ChatCallStreamEvent =
  | { type: 'call.ringing'; call: ChatCallDto }
  | { type: 'call.accepted'; call: ChatCallDto }
  | {
      /** Любой финал: declined, missed, cancelled, ended, failed — в `call.status`. */
      type: 'call.ended';
      call: ChatCallDto;
    }
  | {
      type: 'call.signal';
      callId: string;
      fromUserId: string;
      signal: ChatCallSignal;
      /**
       * Порядковый номер сигнала в очереди получателя (VED-261): растёт
       * монотонно для одного звонка и одного адресата. Нужен, чтобы клиент
       * после обрыва `/chat/stream` понял, что он пропустил, и дочитал
       * недостающее через `GET /chat/calls/:id/signals?after=<seq>`.
       * Необязательное поле — обратная совместимость на случай, если старый
       * инстанс API ещё не проставляет его при скользящем деплое.
       */
      seq?: number;
    };

/**
 * Один сигнал из очереди звонка, адресованный текущему пользователю —
 * элемент ответа `GET /chat/calls/:id/signals` (VED-261).
 */
export interface ChatCallSignalEnvelope {
  seq: number;
  fromUserId: string;
  signal: ChatCallSignal;
}

/**
 * `GET /chat/calls/:id/signals?after=<seq>` — сигналы конкретного звонка,
 * адресованные текущему пользователю, с номером строго больше `after`, по
 * возрастанию. Клиент вызывает это после `accept()` и после каждого
 * переподключения `/chat/stream` в фазах «соединяемся»/«разговор» — на
 * случай, если offer/answer/ICE-кандидат пришёл событием, пока поток не был
 * подключён (VED-261: медленная сеть на телефоне теряла offer именно так).
 */
export interface ChatCallSignalsResponse {
  signals: ChatCallSignalEnvelope[];
}

/** Раздел админки: звонки. */
export interface AdminChatCallStats {
  sinceDays: number;
  total: number;
  byStatus: Partial<Record<ChatCallStatus, number>>;
  /** Доля звонков, пошедших через TURN, среди тех, где это известно. */
  relayedShare: number | null;
  talkSeconds: number;
}

export interface AdminChatCallsState {
  callsEnabled: boolean;
  turnConfigured: boolean;
  stats: AdminChatCallStats;
  calls: ChatCallDto[];
}

export interface UpdateChatCallSettingsRequest {
  callsEnabled: boolean;
}

// ===== Групповые звонки в беседах (VED-293, этап 1: аудио, до 4 человек) =====

/**
 * Потолок участников комнаты. Не «круглое число»: звонок собран mesh'ем —
 * каждый держит соединение с каждым, при N участниках это N−1 исходящих и
 * N−1 входящих потоков на телефон. На пятом Samsung A51 (опорное устройство
 * проекта) начинает захлёбываться: кодирование одного и того же микрофона в
 * четыре независимых потока плюс четыре декодера — уже за гранью. Переход за
 * этот предел означает не «поднять константу», а сервер-микшер (SFU), который
 * решением от 2026-09-21 отложен «до надобности».
 */
export const CHAT_GROUP_CALL_MAX_PARTICIPANTS = 4;

/**
 * Сколько камер разрешено включить в комнате ОДНОВРЕМЕННО (VED-293, этап 4).
 *
 * Меньше, чем участников, и это не осторожность, а арифметика mesh'а.
 * Звук вчетвером — три исходящих потока Opus и три декодера: на Samsung A51
 * (опорное устройство проекта) это заметно только по батарее. Видео в той же
 * комнате — три НЕЗАВИСИМЫХ кодирования одного и того же кадра: у каждого
 * `RTCPeerConnection` свой кодер, общего «сжать один раз и разослать» в
 * mesh'е не бывает — ради этого и заводят сервер-микшер. Плюс три декодера.
 * На четвёртой камере A51 уходит в тепловой троттлинг за минуты: сначала
 * проседает частота кадров сразу у всех, потом система отбирает кодер.
 *
 * Отсюда разделение: в комнате по-прежнему до
 * `CHAT_GROUP_CALL_MAX_PARTICIPANTS` человек, но камер среди них не больше
 * `CHAT_GROUP_CALL_MAX_VIDEO`. Четвёртый остаётся в разговоре голосом и
 * видит остальных; свою камеру включить не может, и отказ приходит с
 * СЕРВЕРА (`POST /state`), а не от кнопки: между «нажал» и «дошло» место
 * мог занять сосед, и решает это тот, кто видит состав целиком.
 *
 * Поднять число «настройкой» нельзя — за этим пределом смысл имеет только
 * сервер-микшер (SFU), отложенный решением от 2026-09-21.
 */
export const CHAT_GROUP_CALL_MAX_VIDEO = 3;

/** Этап 1 — только `audio`; `video` заведён, чтобы не менять тип потом. */
export type ChatGroupCallKind = ChatCallKind;

export type ChatGroupCallStatus = 'live' | 'ended';

export interface ChatGroupCallParticipantDto {
  user: ChatUserSummary;
  joinedAt: string;
  /** Микрофон выключен самим участником — видно остальным. */
  muted: boolean;
  /**
   * Камера включена — то есть этот человек занимает одно из
   * `maxVideoParticipants` мест под видео. Факт с сервера, а не догадка по
   * приходу дорожки: дорожка в mesh'е заводится сразу и молчит, пока камеру
   * не включили (см. `group-peer-link.ts`), так что «есть видеодорожка» и
   * «идёт картинка» — разные вещи.
   */
  video: boolean;
  /** Он «хозяин» комнаты прямо сейчас (самый ранний из живых). */
  host: boolean;
}

export interface ChatGroupCallDto {
  id: string;
  conversationId: string;
  kind: ChatGroupCallKind;
  status: ChatGroupCallStatus;
  /** `null` у завершённой комнаты. */
  hostId: string | null;
  startedBy: ChatUserSummary;
  createdAt: string;
  endedAt: string | null;
  /** Только те, кто прямо сейчас в комнате, по возрастанию `joinedAt`. */
  participants: ChatGroupCallParticipantDto[];
  maxParticipants: number;
  /**
   * Сколько камер можно включить одновременно. Приходит числом, а не берётся
   * клиентом из константы: кнопка «камера» обязана гаснуть по тому же
   * правилу, по которому сервер отказывает, и сборка приложения на телефоне
   * живёт дольше, чем правило на сервере.
   */
  maxVideoParticipants: number;
}

export interface StartChatGroupCallRequest {
  conversationId: string;
  /** Этап 1 принимает только `audio`; поле необязательно. */
  kind?: ChatGroupCallKind;
}

/**
 * Сигналинг mesh'а отличается от звонка один на один ровно одним полем:
 * у сигнала есть адресат. Сервер, как и там, содержимое не разбирает.
 */
export interface ChatGroupCallSignalRequest {
  toUserId: string;
  signal: ChatCallSignal;
  /** Тот же смысл, что у `ChatCallSignalRequest.clientSignalId`. */
  clientSignalId?: string;
}

export interface ChatGroupCallSignalEnvelope {
  seq: number;
  fromUserId: string;
  signal: ChatCallSignal;
}

export interface ChatGroupCallSignalsResponse {
  signals: ChatGroupCallSignalEnvelope[];
}

/**
 * `POST /chat/group-calls/:id/state` — своё состояние микрофона и камеры.
 *
 * Оба поля необязательны, и это важно: запрос меняет ТО, ЧТО В НЁМ ПРИШЛО.
 * Иначе кнопка камеры, отправив `{video:true}`, попутно включала бы
 * микрофон, который человек только что выключил, — и наоборот. Старый
 * клиент шлёт только `{muted}` и продолжает работать как прежде.
 */
export interface SetChatGroupCallStateRequest {
  muted?: boolean;
  /**
   * Включить/выключить камеру. Включение может получить 409 — мест под
   * видео в комнате `maxVideoParticipants`, и решает это сервер.
   */
  video?: boolean;
}

/** `GET /chat/group-calls/active?conversationId=` и `POST /heartbeat`. */
export interface ChatGroupCallState {
  call: ChatGroupCallDto | null;
}

/** События групповых звонков в общем потоке `GET /chat/stream`. */
export type ChatGroupCallStreamEvent =
  | {
      /** Комната открылась — всем участникам беседы, это и есть «входящий». */
      type: 'group-call.started';
      call: ChatGroupCallDto;
    }
  | {
      /** Кто-то вошёл, вышел, выключил микрофон или сменился хозяин. */
      type: 'group-call.updated';
      call: ChatGroupCallDto;
    }
  | { type: 'group-call.ended'; call: ChatGroupCallDto }
  | {
      type: 'group-call.signal';
      callId: string;
      fromUserId: string;
      signal: ChatCallSignal;
      seq?: number;
    };

/** Сводка официального канала VedaMatch для админки. */
export interface ChatOfficialChannelStats {
  conversationId: string;
  title: string;
  subscribers: number;
  /** Вышли из канала сами: «Подписать всех» их не возвращает. */
  left: number;
  /** Включили уведомления по каналу. */
  notificationsOn: number;
  /** Активные участники портала без строки членства. */
  missing: number;
}

/** Ответ «Подписать всех»: сводка после синхронизации и число добавленных. */
export interface ChatOfficialChannelSyncResult extends ChatOfficialChannelStats {
  added: number;
}

// ===== Быстрая конференция по ссылке (VED-360) =====

/**
 * Путь короткой ссылки на конференцию: `https://vedamatch.ru/j/<токен>`.
 *
 * Короткий и без имени сервиса нарочно — ссылку пересылают в мессенджер и
 * диктуют вслух, а `/chat/conference/join/<токен>` в такой роли не живёт.
 * Прецедент в портале уже есть: `/m/<id>` — короткая ссылка на профиль.
 * Маршруты API при этом остаются под префиксом сервиса (`chat/conference/*`).
 */
export const CHAT_CONFERENCE_LINK_PATH = '/j/';

/**
 * Токен ссылки: 24 случайных байта в base64url — ровно 32 символа из
 * `[A-Za-z0-9_-]`. 192 бита: ссылку не подобрать ни перебором, ни по
 * соседнему токену.
 */
export const CHAT_CONFERENCE_TOKEN_LENGTH = 32;

/**
 * Сколько живёт ссылка. Конференция — про «сейчас»: встречу назначают на
 * сегодня-завтра, и дверь, открытая на неделю, — это дверь, о которой забыли.
 * Полсуток покрывают и «созвонимся вечером», и часовые пояса внутри страны.
 */
export const CHAT_CONFERENCE_LINK_TTL_HOURS = 12;

/**
 * Что со ссылкой. `full` сюда не входит: заполненность — это про комнату в
 * конкретную секунду, а не про саму ссылку, и освободившееся место снова
 * делает вход возможным.
 */
export type ChatConferenceLinkState = 'active' | 'expired' | 'revoked';

/** Комната конференции глазами того, кто уже внутри: чем поделиться. */
export interface ChatConferenceDto {
  /** Комната — обычная групповая беседа; это её id. */
  conversationId: string;
  title: string;
  /** Полный адрес для кнопки «скопировать». */
  url: string;
  state: ChatConferenceLinkState;
  expiresAt: string;
  revokedAt: string | null;
  /** Сколько мест занято и сколько их всего (потолок mesh'а). */
  seatsTaken: number;
  maxParticipants: number;
  /** Идёт ли прямо сейчас разговор в комнате. */
  callLive: boolean;
  /**
   * Вправе ли спрашивающий закрыть вход и выдать новую ссылку. Считает
   * сервер, а не экран: право зависит от роли в беседе, и два клиента,
   * выводящие его каждый по-своему, разойдутся с сервером на первой же
   * правке. Обычный участник ссылку видит и копирует, но не распоряжается ею.
   */
  canManage: boolean;
}

/**
 * Что видит открывший ссылку — в том числе гость, который ещё не вошёл.
 * Наружу отдаётся минимум: кто зовёт, сколько уже внутри и сколько мест
 * осталось. Переписки и состава беседы здесь нет и быть не может.
 */
export interface ChatConferenceInviteDto {
  title: string;
  host: ChatUserSummary;
  state: ChatConferenceLinkState;
  expiresAt: string;
  seatsTaken: number;
  maxParticipants: number;
  callLive: boolean;
  /**
   * Спрашивающий уже в комнате — кнопка говорит «вернуться», а не
   * «присоединиться». У гостя всегда `false`.
   */
  alreadyMember: boolean;
  /**
   * Человеческая причина, почему войти нельзя прямо сейчас; `null` — можно.
   * Собирается сервером: причина одна и та же на сайте и в приложении.
   */
  denial: string | null;
}

/** `POST /chat/conference` — завести конференцию. Тело не нужно. */
export interface CreateChatConferenceRequest {
  /**
   * Название комнаты. Пустое — сервер соберёт сам («Конференция · Имя»):
   * быстрая конференция не должна начинаться с формы.
   */
  title?: string;
}

/*
 * Статусы (VED-129) — как в WhatsApp и Telegram: короткий пост текстом,
 * картинкой, тем и другим или коротким видео. Живёт сутки, виден всем
 * участникам портала, кроме заблокированных в обе стороны. Вокруг аватарки
 * автора — зелёный кружок, разделённый на столько секций, сколько у него
 * живых статусов; просмотренные секции гаснут.
 */

/** Сколько живёт статус. */
export const CHAT_STATUS_TTL_HOURS = 24;
/** Сколько живых статусов может быть у одного человека сразу. */
export const CHAT_STATUS_MAX_ACTIVE = 30;
export const CHAT_STATUS_TEXT_MAX = 700;
export const CHAT_STATUS_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_STATUS_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
/** «Короткое видео»: минута — предел WhatsApp. */
export const CHAT_STATUS_VIDEO_MAX_SECONDS = 60;
export const CHAT_STATUS_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const CHAT_STATUS_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'] as const;

export type ChatStatusMediaKind = 'photo' | 'video';

export interface ChatStatusMediaDto {
  kind: ChatStatusMediaKind;
  url: string;
  /** Обложка ролика; у фото — `null`. */
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
}

export interface ChatStatusDto {
  id: string;
  text: string | null;
  media: ChatStatusMediaDto | null;
  createdAt: string;
  expiresAt: string;
  /** Смотрящий уже открывал этот статус. У своих — всегда `true`. */
  viewed: boolean;
  /** Сколько человек посмотрели. Только автору; остальным — `null`. */
  viewCount: number | null;
}

/** Статусы одного человека по порядку публикации. */
export interface ChatStatusAuthorDto {
  user: ChatUserSummary;
  statuses: ChatStatusDto[];
  /** Сколько непросмотренных — столько зелёных секций в кружке. */
  unseen: number;
}

/**
 * `GET /chat/statuses` — лента статусов. Свои — отдельно и первыми: полоса
 * начинается с «Мой статус». Чужие — сначала с непросмотренными, свежие
 * выше.
 */
export interface ChatStatusFeedResponse {
  mine: ChatStatusAuthorDto | null;
  others: ChatStatusAuthorDto[];
}

/** Кружок вокруг аватарки: сколько секций и сколько из них зелёные. */
export interface ChatStatusRing {
  total: number;
  unseen: number;
}
