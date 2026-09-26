import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import type {
  ChatCallSignal,
  ChatGroupCallDto,
  ChatGroupCallSignalEnvelope,
  NotificationEvent,
  StartChatGroupCallRequest,
} from '@vedamatch/shared';
import {
  CHAT_GROUP_CALL_MESSAGE_SOURCE,
  resolveDisplayName,
} from '@vedamatch/shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import { denyWrite, WRITE_DENIAL_TEXT } from '../../chat-access';
import { ChatConversationsService } from '../../chat-conversations.service';
import { toMessageDto, toUserSummary } from '../../chat-dto';
import { ChatEventsService } from '../../chat-events.service';
import { ChatPresenceService } from '../../chat-presence.service';
import { chatMessageInclude, chatUserSelect } from '../../chat-selects';
import { groupCallEndedText, groupCallStartedText } from './group-call-message';
import {
  groupCallNotifyTargets,
  notifyCooldownThreshold,
  type NotifyCandidate,
} from './group-call-notify';
import {
  GROUP_CALL_HEARTBEAT_MS,
  GROUP_CALL_MAX_PARTICIPANTS,
  hostOf,
  JOIN_DENIAL_TEXT,
  joinDecision,
  liveParticipants,
  staleParticipants,
  shouldEndRoom,
  type RoomParticipant,
} from './group-call-room';
import {
  GROUP_CALL_MAX_VIDEO,
  VIDEO_DENIAL_TEXT,
  videoDecision,
  videoToTurnOff,
} from './group-call-video';
import { GroupCallSignalStore } from './group-call-signals.store';

const roomInclude = {
  startedBy: { select: chatUserSelect },
  participants: { include: { user: { select: chatUserSelect } } },
} satisfies Prisma.ChatGroupCallInclude;

type RoomRow = Prisma.ChatGroupCallGetPayload<{ include: typeof roomInclude }>;

/** Больше — и сигналинг превращается в канал для чего угодно. */
const MAX_SIGNAL_BYTES = 32 * 1024;
const MAX_CLIENT_SIGNAL_ID_LENGTH = 100;

/** Как часто процесс сам обходит живые комнаты и убирает мёртвых. */
const SWEEP_INTERVAL_MS = GROUP_CALL_HEARTBEAT_MS;

/**
 * Групповой звонок в беседе — расширение звонка один на один, а не второй
 * механизм.
 *
 * Медиа идёт mesh'ем мимо сервера: каждый участник держит соединение с
 * каждым поверх тех же TURN-учёток, что и звонок один на один
 * (`GET /chat/calls/ice-servers` — отдельного эндпоинта у группового
 * звонка нет, и не надо). Сервер здесь занят ровно тремя вещами: кто в
 * комнате, перенос сигналов адресату и уборка тех, кто перестал отвечать.
 *
 * Отличия от `ChatCallsService`, из которых всё и следует:
 * - нет «дозвона» и «занято»: комната открыта, в неё входят и выходят по
 *   ходу. Второй звонок в ту же беседу — это та же комната, а не конфликт;
 * - у сигнала есть адресат (`toUserId`), потому что пар до шести;
 * - живость участника подтверждается heartbeat'ом, а не таймером дозвона:
 *   в разговоре без конца некому «не ответить», зато телефон может уехать
 *   в тоннель. Протухшая отметка убирается так же, как истекает ключ
 *   «занят» у звонка один на один, — лениво при обращении плюс обход раз
 *   в `SWEEP_INTERVAL_MS`.
 *
 * Потолок `GROUP_CALL_MAX_PARTICIPANTS` — не настройка, а следствие mesh'а
 * (см. докстрингу константы в `@vedamatch/shared`).
 */
@Injectable()
export class ChatGroupCallsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatGroupCallsService.name);
  private readonly redis: Redis | null;
  private readonly signals: GroupCallSignalStore;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ChatConversationsService,
    private readonly events: ChatEventsService,
    private readonly config: ConfigService,
    private readonly presence: ChatPresenceService,
    private readonly bus: EventEmitter2,
  ) {
    const host = config.get<string>('REDIS_HOST');
    this.redis = host
      ? new Redis({
          host,
          port: Number(config.get('REDIS_PORT') || 6379),
          db: Number(config.get('REDIS_DB') || 0),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        })
      : null;
    this.signals = new GroupCallSignalStore(this.redis);
  }

  async onModuleInit() {
    if (this.redis) {
      try {
        await this.redis.connect();
      } catch (error) {
        this.logger.warn(`Redis недоступен: ${String(error)}`);
      }
    }
    // Обход комнат — на каждом инстансе: работа идемпотентна
    // (`updateMany` с фильтром по состоянию), а лиз ради уборки четырёх
    // строк дороже самой уборки.
    this.sweepTimer = setInterval(() => {
      void this.sweepAllRooms();
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  async onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    if (this.redis?.status === 'ready') await this.redis.quit();
  }

  // ---------- публичные операции ----------

  /**
   * Начать групповой звонок или войти в уже идущий. Две кнопки («начать» и
   * «присоединиться») ведут в одну операцию нарочно: пока человек жал
   * «начать», комнату мог открыть сосед, и вторая комната в той же беседе —
   * это разорванный звонок, а не второй звонок.
   */
  async start(
    userId: string,
    dto: StartChatGroupCallRequest,
  ): Promise<ChatGroupCallDto> {
    if (!(await this.isEnabled()))
      throw new ServiceUnavailableException('Звонки временно выключены');
    if (dto.kind && dto.kind !== 'audio')
      throw new BadRequestException(
        'Видео в групповом звонке пока не поддерживается',
      );

    const conversation = await this.requireGroupConversation(
      dto.conversationId,
      userId,
    );

    const existing = await this.prisma.chatGroupCall.findFirst({
      where: { conversationId: conversation.id, status: 'live' },
      orderBy: { createdAt: 'desc' },
      include: roomInclude,
    });
    if (existing) {
      const swept = await this.sweepRoom(existing);
      if (swept.status === 'live') return this.joinRoom(swept, userId);
    }

    let created: RoomRow;
    try {
      created = await this.prisma.chatGroupCall.create({
        data: {
          conversationId: conversation.id,
          startedById: userId,
          hostId: userId,
          kind: 'audio',
          participants: { create: { userId } },
        },
        include: roomInclude,
      });
    } catch (error) {
      // Гонку двух «начать звонок» в одной беседе ловит частичный
      // уникальный индекс `ChatGroupCall_one_live_per_conversation`:
      // проигравший не падает 500, а входит в комнату победителя — ровно то,
      // чего и хотел человек, нажавший кнопку.
      if (!isUniqueViolation(error)) throw error;
      const winner = await this.prisma.chatGroupCall.findFirstOrThrow({
        where: { conversationId: conversation.id, status: 'live' },
        include: roomInclude,
      });
      return this.joinRoom(winner, userId);
    }
    const room = this.toDto(created);
    // «Входящий групповой» — это событие всем участникам беседы, а не
    // дозвон одному: телефон не звонит, в беседе появляется плашка
    // «идёт звонок». Формулировку собирает клиент, сервер сообщает факт.
    this.publishToConversation(conversation, {
      type: 'group-call.started',
      call: room,
    });
    // Плашку видит только тот, кто в беседу смотрит. Остальных зовёт
    // уведомление — обычное, не нативный вызов.
    await this.announce(created.id, userId);
    // Карточка «Звонок начался · [Войти в звонок]» в ленте: плашка над
    // перепиской пропадает, стоит пролистать или открыть беседу позже, а
    // сообщение остаётся на своём месте и ведёт в тот же вход.
    await this.recordStartInThread(created, conversation);
    return room;
  }

  /** Войти в конкретную комнату — путь из плашки «идёт звонок». */
  async join(userId: string, callId: string): Promise<ChatGroupCallDto> {
    if (!(await this.isEnabled()))
      throw new ServiceUnavailableException('Звонки временно выключены');
    const room = await this.requireRoomForMember(callId, userId);
    return this.joinRoom(await this.sweepRoom(room), userId);
  }

  /**
   * Выйти. Комнату это не закрывает, даже если вышел хозяин: роль перейдёт
   * следующему по времени входа. Закрывается она, когда не осталось живых.
   */
  async leave(userId: string, callId: string): Promise<ChatGroupCallDto> {
    const room = await this.requireRoomForMember(callId, userId);
    if (room.status === 'ended') return this.toDto(room);

    await this.prisma.chatGroupCallParticipant.updateMany({
      where: { callId, userId, state: 'joined' },
      // Камера гасится вместе с выходом: иначе ушедший держал бы одно из
      // трёх мест под видео, пока его строку не перепишет следующий вход.
      data: { state: 'left', leftAt: new Date(), video: false },
    });
    await this.signals.clearRecipient(callId, userId);
    return this.afterRoomChanged(callId);
  }

  /**
   * Микрофон и камера — своё состояние, которое обязаны видеть остальные.
   *
   * Меняется ТОЛЬКО то, что пришло в запросе: кнопка камеры не вправе
   * попутно включить микрофон, который человек только что выключил.
   *
   * Камера, в отличие от микрофона, может получить отказ: мест под видео в
   * комнате `GROUP_CALL_MAX_VIDEO`, и держит этот потолок сервер
   * (`group-call-video.ts`), а не кнопка. Двое, нажавшие «камеру»
   * одновременно на последнее свободное место, обязаны получить разные
   * ответы, и различить их может только тот, кто видит комнату целиком.
   *
   * Занятие места — условный `updateMany` по ПРЕЖНЕМУ значению, а не
   * простая запись: между решением и записью лежит запрос к базе, а API
   * работает не в одном экземпляре. Проигравший эту гонку получает тот же
   * 409, что и опоздавший, — а не «включилось, но у всех рассыпалось».
   */
  async setState(
    userId: string,
    callId: string,
    patch: { muted?: boolean; video?: boolean },
  ): Promise<ChatGroupCallDto> {
    const room = await this.requireRoomForMember(callId, userId);
    if (room.status === 'ended')
      throw new ConflictException(JOIN_DENIAL_TEXT.ended);

    if (typeof patch.video === 'boolean') {
      const decision = videoDecision(
        toRoomParticipants(room),
        userId,
        patch.video,
        Date.now(),
        room.status,
      );
      if (decision.kind === 'deny')
        throw new ConflictException(VIDEO_DENIAL_TEXT[decision.reason]);
      if (decision.kind === 'set') {
        const claimed = await this.prisma.chatGroupCallParticipant.updateMany({
          where: {
            callId,
            userId,
            state: 'joined',
            // Условие по прежнему значению и есть захват места: если его
            // уже переписал другой запрос, `count` окажется нулём.
            video: !decision.video,
          },
          data: { video: decision.video, lastSeenAt: new Date() },
        });
        if (claimed.count === 0 && decision.video)
          throw new ConflictException(VIDEO_DENIAL_TEXT['video-full']);
      }
    }

    if (typeof patch.muted === 'boolean') {
      const updated = await this.prisma.chatGroupCallParticipant.updateMany({
        where: { callId, userId, state: 'joined' },
        data: { muted: patch.muted, lastSeenAt: new Date() },
      });
      if (updated.count === 0)
        throw new ConflictException('Вы не в этом звонке');
    }

    return this.afterRoomChanged(callId);
  }

  /**
   * «Я ещё здесь». Заодно — единственный способ клиента узнать актуальный
   * состав, если поток событий был закрыт: отдаёт ту же комнату.
   */
  async heartbeat(userId: string, callId: string): Promise<ChatGroupCallDto> {
    const room = await this.requireRoomForMember(callId, userId);
    if (room.status === 'ended') return this.toDto(room);
    await this.prisma.chatGroupCallParticipant.updateMany({
      where: { callId, userId, state: 'joined' },
      data: { lastSeenAt: new Date() },
    });
    const swept = await this.sweepRoom(
      await this.prisma.chatGroupCall.findUniqueOrThrow({
        where: { id: callId },
        include: roomInclude,
      }),
    );
    return this.toDto(swept);
  }

  /** Идёт ли звонок в этой беседе — для плашки в переписке. */
  async activeForConversation(
    userId: string,
    conversationId: string,
  ): Promise<ChatGroupCallDto | null> {
    await this.requireGroupConversation(conversationId, userId);
    const room = await this.prisma.chatGroupCall.findFirst({
      where: { conversationId, status: 'live' },
      orderBy: { createdAt: 'desc' },
      include: roomInclude,
    });
    if (!room) return null;
    const swept = await this.sweepRoom(room);
    return swept.status === 'live' ? this.toDto(swept) : null;
  }

  /** Комната, в которой человек прямо сейчас — восстановление после перезапуска. */
  async activeForUser(userId: string): Promise<ChatGroupCallDto | null> {
    const row = await this.prisma.chatGroupCall.findFirst({
      where: {
        status: 'live',
        participants: { some: { userId, state: 'joined' } },
      },
      orderBy: { createdAt: 'desc' },
      include: roomInclude,
    });
    if (!row) return null;
    const swept = await this.sweepRoom(row);
    const stillIn = liveParticipants(
      toRoomParticipants(swept),
      Date.now(),
    ).some((p) => p.userId === userId);
    return swept.status === 'live' && stillIn ? this.toDto(swept) : null;
  }

  /**
   * Перенести offer/answer/ICE конкретному участнику. Сервер содержимое не
   * разбирает — только проверяет, что оба в одной живой комнате.
   */
  async signal(
    userId: string,
    callId: string,
    toUserId: string,
    signal: ChatCallSignal,
    clientSignalId?: string,
  ): Promise<void> {
    if (typeof toUserId !== 'string' || !toUserId)
      throw new BadRequestException('Не указан адресат сигнала');
    if (toUserId === userId)
      throw new BadRequestException('Сигнал самому себе');
    if (!isSignal(signal)) throw new BadRequestException('Неверный сигнал');
    if (Buffer.byteLength(JSON.stringify(signal), 'utf8') > MAX_SIGNAL_BYTES)
      throw new BadRequestException('Сигнал слишком большой');

    const room = await this.requireRoomForMember(callId, userId);
    if (room.status === 'ended')
      throw new ConflictException('Звонок уже завершён');
    const now = Date.now();
    const live = liveParticipants(toRoomParticipants(room), now);
    if (!live.some((p) => p.userId === userId))
      throw new ForbiddenException('Вы не в этом звонке');
    if (!live.some((p) => p.userId === toUserId))
      throw new NotFoundException('Адресат уже вышел из звонка');

    const key = normalizeClientSignalId(clientSignalId);
    if (key && !(await this.signals.claim(callId, userId, key))) return;

    const seq = await this.signals.nextSeq(callId);
    await this.signals.store(callId, toUserId, {
      seq,
      fromUserId: userId,
      signal,
    });
    this.events.publish([toUserId], {
      type: 'group-call.signal',
      callId,
      fromUserId: userId,
      signal,
      seq,
    });
  }

  /** Дочитать пропущенное, пока `/chat/stream` не был подключён. */
  async signalsSince(
    userId: string,
    callId: string,
    after: number,
  ): Promise<ChatGroupCallSignalEnvelope[]> {
    await this.requireRoomForMember(callId, userId);
    const entries = await this.signals.read(callId, userId);
    return entries
      .filter((entry) => entry.seq > after)
      .sort((a, b) => a.seq - b.seq)
      .map(({ seq, fromUserId, signal }) => ({ seq, fromUserId, signal }));
  }

  // ---------- внутреннее ----------

  /**
   * Выключатель у групповых звонков общий со звонками один на один: и env
   * `CALLS_ENABLED`, и строка `ChatSettings` из админки. Отдельный рубильник
   * был бы ловушкой — выключив звонки при инциденте с TURN, админ вправе
   * ожидать, что выключились все.
   */
  private async isEnabled(): Promise<boolean> {
    if ((this.config.get<string>('CALLS_ENABLED') ?? 'true') === 'false')
      return false;
    const row = await this.prisma.chatSettings.findUnique({
      where: { id: 'global' },
      select: { callsEnabled: true },
    });
    return row?.callsEnabled ?? true;
  }

  private async joinRoom(
    room: RoomRow,
    userId: string,
  ): Promise<ChatGroupCallDto> {
    const decision = joinDecision(
      toRoomParticipants(room),
      userId,
      Date.now(),
      room.status,
    );
    if (decision.kind === 'deny') {
      if (decision.reason === 'ended')
        throw new ConflictException(JOIN_DENIAL_TEXT.ended);
      throw new ConflictException(JOIN_DENIAL_TEXT.full);
    }
    if (decision.kind === 'rejoin') {
      await this.prisma.chatGroupCallParticipant.updateMany({
        where: { callId: room.id, userId },
        data: { lastSeenAt: new Date() },
      });
      return this.toDto(
        await this.prisma.chatGroupCall.findUniqueOrThrow({
          where: { id: room.id },
          include: roomInclude,
        }),
      );
    }

    const now = new Date();
    // Повторный вход после выхода переиспользует строку: `joinedAt`
    // переписывается — иначе прежнее время входа сделало бы вернувшегося
    // хозяином вперёд тех, кто всё это время сидел в комнате.
    await this.prisma.chatGroupCallParticipant.upsert({
      where: { callId_userId: { callId: room.id, userId } },
      create: { callId: room.id, userId, joinedAt: now, lastSeenAt: now },
      update: {
        state: 'joined',
        joinedAt: now,
        leftAt: null,
        lastSeenAt: now,
        muted: false,
        // Вход всегда начинается с выключенной камеры: место под видео
        // выпрашивается отдельным `POST /state`, и наследовать его от
        // прошлого захода нельзя — за это время его мог занять другой.
        video: false,
      },
    });
    // Очередь сигналов прошлого захода — не наследство нового: offer оттуда
    // уже протух.
    await this.signals.clearRecipient(room.id, userId);
    const dto = await this.afterRoomChanged(room.id);
    // Пришёл кто-то новый. Уведомление уйдёт, только если прошлая волна
    // была давно (`GROUP_CALL_NOTIFY_COOLDOWN_MS`): вход второго и третьего
    // не должен рассылать беседе ещё две волны. Зато разговор, который
    // тянется полчаса, имеет право напомнить о себе тому, кто так и не
    // пришёл. `rejoin` сюда не попадает: тот же человек с другого экрана —
    // не повод будить беседу.
    await this.announce(room.id, userId);
    return dto;
  }

  /**
   * Пересчитать состав, хозяина и статус, разослать `group-call.updated`
   * или `group-call.ended`. Одна точка на все изменения комнаты.
   */
  private async afterRoomChanged(callId: string): Promise<ChatGroupCallDto> {
    const room = await this.sweepRoom(
      await this.prisma.chatGroupCall.findUniqueOrThrow({
        where: { id: callId },
        include: roomInclude,
      }),
    );
    const dto = this.toDto(room);
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id: room.conversationId },
      select: { members: { select: { userId: true, leftAt: true } } },
    });
    const recipients = (conversation?.members ?? [])
      .filter((m) => !m.leftAt)
      .map((m) => m.userId);
    this.events.publish(recipients, {
      type: room.status === 'ended' ? 'group-call.ended' : 'group-call.updated',
      call: dto,
    });
    return dto;
  }

  /**
   * Позвать в звонок тех, кого в беседе сейчас нет. Никогда не бросает:
   * непришедшее уведомление — не повод уронить сам звонок, ради которого
   * человек нажал кнопку.
   */
  private async announce(callId: string, actorId: string): Promise<void> {
    try {
      await this.notifyConversation(callId, actorId);
    } catch (error) {
      this.logger.warn(
        `Уведомление о групповом звонке ${callId} не разослано: ${String(error)}`,
      );
    }
  }

  /**
   * Уведомление «в беседе идёт звонок».
   *
   * Обычное уведомление, а не нативный вызов: `chat.call-incoming` поднял бы
   * полноэкранный входящий на один `callId`, а комната — это не дозвон, её
   * нечем «принять», и трое в беседе дали бы три звонка на телефон. Своё имя
   * события (`chat.group-call-started`) идёт общим конвейером модуля
   * уведомлений — колокольчик, веб-пуш, FCM, Telegram — и ведёт в беседу,
   * где решение войти остаётся за человеком.
   *
   * Наружу — только факты: название беседы и имя зовущего едут в событии,
   * формулировку собирает `notification-copy.ts`.
   */
  private async notifyConversation(
    callId: string,
    actorId: string,
  ): Promise<void> {
    const now = Date.now();
    // Право на рассылку забирается ДО всякой работы и условным апдейтом:
    // так и от повторных волн защищает, и гонку двух инстансов решает —
    // рассылает тот, кто первым переписал отметку.
    const claimed = await this.prisma.chatGroupCall.updateMany({
      where: {
        id: callId,
        status: 'live',
        OR: [
          { notifiedAt: null },
          { notifiedAt: { lt: notifyCooldownThreshold(now) } },
        ],
      },
      data: { notifiedAt: new Date(now) },
    });
    if (claimed.count === 0) return;

    const room = await this.prisma.chatGroupCall.findUnique({
      where: { id: callId },
      include: roomInclude,
    });
    if (!room || room.status !== 'live') return;

    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id: room.conversationId },
      select: {
        title: true,
        members: {
          select: { userId: true, leftAt: true, mutedUntil: true },
        },
      },
    });
    if (!conversation) return;

    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { name: true, spiritualName: true },
    });
    if (!actor) return;

    const live = new Set(
      liveParticipants(toRoomParticipants(room), now).map((p) => p.userId),
    );
    const leftRoomAt = new Map(
      room.participants.map((p) => [p.userId, p.leftAt?.getTime() ?? null]),
    );

    const candidates: NotifyCandidate[] = [];
    for (const member of conversation.members) {
      candidates.push({
        userId: member.userId,
        leftConversation: Boolean(member.leftAt),
        mutedUntil: member.mutedUntil?.getTime() ?? null,
        inRoom: live.has(member.userId),
        leftRoomAt: leftRoomAt.get(member.userId) ?? null,
        // Смотрящего беседу будить нечем: плашка «идёт звонок» у него уже
        // на экране. Присутствие спрашиваем только у тех, кто дошёл до
        // этого места, — остальных отсеяли дешёвые проверки выше.
        viewing: live.has(member.userId)
          ? false
          : await this.presence.isViewing(member.userId, room.conversationId),
      });
    }

    const starterName = resolveDisplayName(actor);
    const conversationTitle = conversation.title?.trim() || 'Групповая беседа';
    for (const recipientId of groupCallNotifyTargets(candidates, now)) {
      const event: NotificationEvent = {
        name: 'chat.group-call-started',
        recipientId,
        conversationTitle,
        conversationId: room.conversationId,
        callId: room.id,
        starterName,
      };
      this.bus.emit(event.name, event);
    }
  }

  /**
   * Уборка мёртвых участников и, если живых не осталось, закрытие комнаты.
   * Лениво при каждом обращении — тот же приём, что у `expireIfStale`
   * звонка один на один: отдельный источник состояния не заводится,
   * периодический обход ниже только подхватывает комнаты, к которым никто
   * не обращается.
   */
  private async sweepRoom(room: RoomRow): Promise<RoomRow> {
    if (room.status === 'ended') return room;
    const now = Date.now();
    const participants = toRoomParticipants(room);
    const stale = staleParticipants(participants, now);
    const nextHost = hostOf(participants, now);
    const ending = shouldEndRoom(participants, now);
    // Штатно список пуст: выход участника мест под видео не отнимает.
    // Непусто он бывает, когда потолок опустили правкой кода, пока комнаты
    // уже шли, либо когда в строки залезли руками. Тогда лишние камеры
    // гасятся сами — иначе на телефонах продолжает греться разговор,
    // которого правила портала больше не допускают.
    const excessVideo = videoToTurnOff(participants, now);
    let endedHere = false;

    if (
      stale.length === 0 &&
      excessVideo.length === 0 &&
      !ending &&
      room.hostId === nextHost
    )
      return room;

    if (excessVideo.length > 0)
      await this.prisma.chatGroupCallParticipant.updateMany({
        where: { callId: room.id, userId: { in: excessVideo } },
        data: { video: false },
      });

    if (stale.length > 0)
      await this.prisma.chatGroupCallParticipant.updateMany({
        where: {
          callId: room.id,
          state: 'joined',
          userId: { in: stale.map((p) => p.userId) },
        },
        // Уехавший в тоннель освобождает и место в комнате, и место под
        // видео — по той же причине, что и вышедший сам (см. `leave`).
        data: { state: 'left', leftAt: new Date(), video: false },
      });

    if (ending) {
      // Гонка двух уборщиков: побеждает тот, кто первым перевёл строку из
      // `live` — остальные получают `count: 0` и просто перечитывают.
      const claimed = await this.prisma.chatGroupCall.updateMany({
        where: { id: room.id, status: 'live' },
        data: {
          status: 'ended',
          endedAt: new Date(),
          endReason: stale.length > 0 ? 'timeout' : 'empty',
          hostId: null,
        },
      });
      if (claimed.count > 0) {
        endedHere = true;
        await this.signals.clearCall(
          room.id,
          room.participants.map((p) => p.userId),
        );
      }
    } else if (room.hostId !== nextHost) {
      await this.prisma.chatGroupCall.update({
        where: { id: room.id },
        data: { hostId: nextHost },
      });
    }

    const fresh = await this.prisma.chatGroupCall.findUniqueOrThrow({
      where: { id: room.id },
      include: roomInclude,
    });
    // Закрытие комнаты проходит только здесь — и выход последнего, и
    // обход протухших. Карточку правит тот уборщик, что выиграл гонку
    // (`claimed.count > 0`), поэтому «завершён» пишется ровно один раз.
    if (endedHere) await this.recordEndInThread(fresh);
    return fresh;
  }

  /**
   * Обход всех живых комнат. Нужен ровно для одного случая: комната, из
   * которой все ушли молча (приложение убито, сеть пропала), — обращаться к
   * ней больше некому, и без обхода она осталась бы `live` навсегда.
   */
  private async sweepAllRooms(): Promise<void> {
    try {
      const rooms = await this.prisma.chatGroupCall.findMany({
        where: { status: 'live' },
        include: roomInclude,
        take: 200,
      });
      for (const room of rooms) {
        const before = room.status;
        const swept = await this.sweepRoom(room);
        // Рассылаем, только если что-то действительно изменилось: тик раз в
        // 15 секунд не должен превращаться в поток одинаковых событий.
        if (swept.status !== before || participantsChanged(room, swept))
          await this.afterRoomChanged(room.id);
      }
    } catch (error) {
      this.logger.warn(`Обход комнат групповых звонков: ${String(error)}`);
    }
  }

  private async requireGroupConversation(
    conversationId: string,
    userId: string,
  ) {
    const conversation = await this.conversations.requireConversation(
      conversationId,
      userId,
    );
    if (conversation.kind === 'direct')
      throw new BadRequestException(
        'В личном диалоге звонят обычным звонком, а не групповым',
      );
    if (conversation.kind === 'channel')
      throw new BadRequestException('В канале групповых звонков нет');
    const mine = conversation.members.find((m) => m.userId === userId);
    const denial = denyWrite(
      {
        kind: conversation.kind,
        state: conversation.state,
        requestedById: conversation.requestedById,
        blocked: false,
      },
      mine
        ? { userId: mine.userId, role: mine.role, leftAt: mine.leftAt }
        : null,
    );
    if (denial) throw new ForbiddenException(WRITE_DENIAL_TEXT[denial]);
    return conversation;
  }

  /** Комната существует, и спрашивающий — участник её беседы. */
  private async requireRoomForMember(
    callId: string,
    userId: string,
  ): Promise<RoomRow> {
    const room = await this.prisma.chatGroupCall.findUnique({
      where: { id: callId },
      include: roomInclude,
    });
    if (!room) throw new NotFoundException('Звонок не найден');
    const member = await this.prisma.chatMember.findFirst({
      where: { conversationId: room.conversationId, userId, leftAt: null },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Звонок не найден');
    return room;
  }

  /**
   * Сообщение о начале звонка — от лица начавшего, как запись о звонке один
   * на один (`ChatCallsService.recordInThread`). Пуша нет: беседу уже позвало
   * `chat.group-call-started`, второе уведомление о том же было бы шумом.
   * Никогда не бросает: без карточки звонок всё равно идёт, и вход в него
   * есть в плашке и в шапке.
   */
  private async recordStartInThread(
    room: RoomRow,
    conversation: { members: { userId: string; leftAt: Date | null }[] },
  ): Promise<void> {
    try {
      const text = groupCallStartedText();
      const created = await this.prisma.chatMessage.create({
        data: {
          conversationId: room.conversationId,
          authorId: room.startedById,
          body: text.body,
          attachments: {
            create: [
              {
                kind: 'call',
                title: text.title,
                subtitle: text.subtitle,
                sourceService: CHAT_GROUP_CALL_MESSAGE_SOURCE,
                sourceId: room.id,
                waveform: [],
                position: 0,
              },
            ],
          },
        },
        include: chatMessageInclude,
      });
      await this.prisma.chatConversation.update({
        where: { id: room.conversationId },
        data: { lastMessageAt: created.createdAt },
      });
      // Начавший свою карточку «прочитал»; остальным она приходит
      // непрочитанной — это и есть приглашение, его должно быть видно в
      // списке бесед.
      await this.prisma.chatMember.updateMany({
        where: {
          conversationId: room.conversationId,
          userId: room.startedById,
        },
        data: { lastReadAt: created.createdAt },
      });
      this.publishToConversation(conversation, {
        type: 'message.created',
        conversationId: room.conversationId,
        message: toMessageDto(created, room.startedById),
      });
    } catch (error) {
      this.logger.warn(
        `Карточка группового звонка ${room.id} не попала в ленту: ${String(error)}`,
      );
    }
  }

  /**
   * Комната закрылась — та же карточка становится «Звонок завершён ·
   * длительность». Правится существующее сообщение, а не пишется второе:
   * две записи на один звонок раздували бы ленту, а кнопка «Войти» на
   * старой карточке вела бы в закрытую комнату.
   *
   * `editedAt` не трогаем: это не правка автора, пометка «изменено» над
   * карточкой звонка была бы враньём.
   */
  private async recordEndInThread(room: RoomRow): Promise<void> {
    try {
      // Сообщение не старше комнаты — это держит поиск в пределах свежего
      // хвоста беседы, а не всей её истории.
      const attachment = await this.prisma.chatAttachment.findFirst({
        where: {
          kind: 'call',
          sourceService: CHAT_GROUP_CALL_MESSAGE_SOURCE,
          sourceId: room.id,
          message: {
            conversationId: room.conversationId,
            createdAt: { gte: room.createdAt },
          },
        },
        select: { id: true, messageId: true },
      });
      if (!attachment) return;
      const text = groupCallEndedText(room.createdAt, room.endedAt);
      await this.prisma.chatAttachment.update({
        where: { id: attachment.id },
        data: { subtitle: text.subtitle, durationSec: text.durationSec },
      });
      const updated = await this.prisma.chatMessage.update({
        where: { id: attachment.messageId },
        data: { body: text.body },
        include: chatMessageInclude,
      });
      const conversation = await this.prisma.chatConversation.findUnique({
        where: { id: room.conversationId },
        select: { members: { select: { userId: true, leftAt: true } } },
      });
      if (!conversation) return;
      this.publishToConversation(conversation, {
        type: 'message.updated',
        conversationId: room.conversationId,
        message: toMessageDto(updated, room.startedById),
      });
    } catch (error) {
      this.logger.warn(
        `Карточка группового звонка ${room.id} не закрыта: ${String(error)}`,
      );
    }
  }

  private publishToConversation(
    conversation: { members: { userId: string; leftAt: Date | null }[] },
    event: Parameters<ChatEventsService['publish']>[1],
  ): void {
    this.events.publish(
      conversation.members.filter((m) => !m.leftAt).map((m) => m.userId),
      event,
    );
  }

  private toDto(room: RoomRow): ChatGroupCallDto {
    const now = Date.now();
    const live = liveParticipants(toRoomParticipants(room), now);
    const host =
      room.status === 'ended' ? null : hostOf(toRoomParticipants(room), now);
    const byId = new Map(room.participants.map((p) => [p.userId, p]));
    return {
      id: room.id,
      conversationId: room.conversationId,
      kind: room.kind,
      status: room.status,
      hostId: host,
      startedBy: toUserSummary(room.startedBy),
      createdAt: room.createdAt.toISOString(),
      endedAt: room.endedAt?.toISOString() ?? null,
      maxParticipants: GROUP_CALL_MAX_PARTICIPANTS,
      maxVideoParticipants: GROUP_CALL_MAX_VIDEO,
      participants: live.map((p) => ({
        user: toUserSummary(byId.get(p.userId)!.user),
        joinedAt: new Date(p.joinedAt).toISOString(),
        muted: p.muted,
        video: p.video,
        host: p.userId === host,
      })),
    };
  }
}

/** Строки базы → то, с чем работают чистые правила комнаты. */
function toRoomParticipants(room: RoomRow): RoomParticipant[] {
  return room.participants
    .filter((p) => p.state === 'joined')
    .map((p) => ({
      userId: p.userId,
      joinedAt: p.joinedAt.getTime(),
      lastSeenAt: p.lastSeenAt.getTime(),
      muted: p.muted,
      video: p.video,
    }));
}

function participantsChanged(before: RoomRow, after: RoomRow): boolean {
  const ids = (room: RoomRow) =>
    room.participants
      .filter((p) => p.state === 'joined')
      .map((p) => p.userId)
      .sort()
      .join(',');
  return ids(before) !== ids(after);
}

/** P2002 — нарушение уникального индекса; `code` у `PrismaClientKnownRequestError`. */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

function isSignal(value: unknown): value is ChatCallSignal {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.kind === 'sdp') {
    const sdp = v.sdp as Record<string, unknown> | undefined;
    return (
      Boolean(sdp) &&
      (sdp!.type === 'offer' || sdp!.type === 'answer') &&
      typeof sdp!.sdp === 'string'
    );
  }
  if (v.kind === 'candidate') {
    if (v.candidate === null) return true;
    const c = v.candidate as Record<string, unknown> | undefined;
    return Boolean(c) && typeof c!.candidate === 'string';
  }
  return false;
}

function normalizeClientSignalId(value: unknown): string | null {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_CLIENT_SIGNAL_ID_LENGTH
    ? value
    : null;
}
