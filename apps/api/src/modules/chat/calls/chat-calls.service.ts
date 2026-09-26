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
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import type {
  AdminChatCallStats,
  AdminChatCallsState,
  ChatCallDto,
  ChatCallEndedEvent,
  ChatCallEndReason,
  ChatCallSignal,
  ChatCallSignalEnvelope,
  ChatCallStatus,
  EndChatCallRequest,
  NotificationEvent,
  StartChatCallRequest,
  UpdateChatCallSettingsRequest,
} from '@vedamatch/shared';
import { CHAT_CALL_ENDED_EVENT, resolveDisplayName } from '@vedamatch/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { denyWrite, WRITE_DENIAL_TEXT } from '../chat-access';
import { ChatConversationsService } from '../chat-conversations.service';
import { toMessageDto, toUserSummary } from '../chat-dto';
import { ChatEventsService } from '../chat-events.service';
import { chatMessageInclude, chatUserSelect } from '../chat-selects';
import { PeopleAvatarService } from '../people/people-avatar.service';
import { callSummary } from './call-summary';
import {
  BUSY_TTL_ACTIVE_MS,
  BUSY_TTL_RINGING_MS,
  RING_TIMEOUT_MS,
  callEndedPushReason,
  isFinal,
  roleOf,
  transition,
  type CallAction,
} from './call-state';

const callInclude = {
  caller: { select: chatUserSelect },
  callee: { select: chatUserSelect },
} satisfies Prisma.ChatCallInclude;

type ChatCallRow = Prisma.ChatCallGetPayload<{ include: typeof callInclude }>;

const BUSY_PREFIX = 'chat:call:busy:';
/** Больше — и сигналинг превращается в канал для чего угодно. */
const MAX_SIGNAL_BYTES = 32 * 1024;
/** Ключи хранения последних сигналов активного звонка (VED-261). */
const SIGNAL_PREFIX = 'chat:call:signals:';
const SIGNAL_SEQ_PREFIX = 'chat:call:signal-seq:';
/** Идемпотентность повтора одного сигнала (VED-261, feedback-002). */
const SIGNAL_IDEMPOTENCY_PREFIX = 'chat:call:signal-idem:';
/** «50 на сторону» из карточки задачи: дольше этого сигналинг звонка не
 *  живёт, а держать больше — платить памятью за то, что клиент отбросит. */
const MAX_SIGNALS_PER_RECIPIENT = 50;
/** `crypto.randomUUID()` — 36 символов; с запасом на будущее, не более. */
const MAX_CLIENT_SIGNAL_ID_LENGTH = 100;

interface StoredCallSignal {
  seq: number;
  fromUserId: string;
  signal: ChatCallSignal;
}

/**
 * Звонки один на один внутри личного диалога.
 *
 * Медиа идёт мимо сервера (WebRTC, при нужде через coturn); здесь — кто
 * кому звонит, приняли ли, и перенос сигналинга второй стороне через тот
 * же поток событий, что и сообщения. Запись о звонке ложится в ленту
 * диалога обычным сообщением с вложением `call`.
 *
 * «Занят» и таймер дозвона: отметка занятости — в Redis (или в памяти при
 * одном инстансе, как у присутствия), таймер — в процессе, который принял
 * звонок. Если этот процесс перезапустился, застрявший `ringing` добивается
 * при следующем обращении к звонку (`expireIfStale`).
 *
 * Последние сигналы (offer/answer/ICE) активного звонка хранятся отдельно от
 * рассылки в `/chat/stream`: Signal-в-БД не пишет никто — это по-прежнему
 * секунды жизни, но `GET /chat/calls/:id/signals` должен быть способен
 * отдать пропущенное клиенту, у которого в момент рассылки `call.signal` не
 * было открытого `/chat/stream` (VED-261: именно так терялся offer на
 * телефоне на медленной сети). Очищаются безусловно в `finish()` — держать
 * сигналинг завершённого звонка незачем.
 *
 * В отличие от «занятости» (где Redis — просто оптимизация, и сбой одной
 * команды безопасно долить локальной картой), для сигналов источник правды
 * должен быть один: если два инстанса за Traefik разойдутся в том, где лежит
 * конкретный сигнал (один записал в свою память при сбое Redis, другой
 * читает из Redis и видит пусто), результат — та же молчаливая потеря
 * сигнала, которую чинит вся эта задача, только новым путём. Поэтому:
 * REDIS_HOST задан → Redis обязателен для сигналов этого процесса, сбой
 * записи/чтения (даже транзиентный — `INCR`/`RPUSH`/`LRANGE` упал, но
 * `redis.status` всё ещё `'ready'`) не подменяется локальной картой, а после
 * короткого повтора (`withRedisRetry`) превращается в `ServiceUnavailableException`
 * (503) — отправитель обязан повторить запрос сам, а не получить сигнал,
 * который никто, кроме этого инстанса, не увидит. Локальная память —
 * исключительно path «Redis не настроен вовсе» (dev, один инстанс), с
 * ленивой TTL-очисткой (`pruneStaleLocalSignals`), чтобы звонок, для
 * которого `finish()` почему-то не вызвался, не держал память вечно.
 */
@Injectable()
export class ChatCallsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatCallsService.name);
  private readonly redis: Redis | null;
  private readonly localBusy = new Map<
    string,
    { callId: string; expiresAt: number }
  >();
  private readonly ringTimers = new Map<string, NodeJS.Timeout>();
  /** callId → следующий seq. Только когда Redis не настроен вовсе. */
  private readonly localSignalSeq = new Map<string, number>();
  /** callId → (toUserId → сигналы по возрастанию seq). Тот же режим. */
  private readonly localSignals = new Map<
    string,
    Map<string, StoredCallSignal[]>
  >();
  /** callId → когда последний раз трогали локальные сигналы — для
   *  `pruneStaleLocalSignals` (TTL без Redis, см. класс-докстринг). */
  private readonly localSignalsTouchedAt = new Map<string, number>();
  /** callId → уже виденные `userId:clientSignalId` (идемпотентность повтора,
   *  только без Redis — тот же жизненный цикл, что у остальных локальных
   *  сигналов этого звонка). */
  private readonly localIdempotentSignals = new Map<string, Set<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ChatConversationsService,
    private readonly events: ChatEventsService,
    private readonly bus: EventEmitter2,
    private readonly config: ConfigService,
    private readonly avatars: PeopleAvatarService,
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
  }

  async onModuleInit() {
    if (!this.redis) {
      this.logger.warn(
        'REDIS_HOST не задан — занятость в звонках не переживает несколько инстансов',
      );
      return;
    }
    try {
      await this.redis.connect();
    } catch (error) {
      this.logger.warn(`Redis недоступен: ${String(error)}`);
    }
  }

  async onModuleDestroy() {
    for (const timer of this.ringTimers.values()) clearTimeout(timer);
    this.ringTimers.clear();
    if (this.redis?.status === 'ready') await this.redis.quit();
  }

  /**
   * Два выключателя: env `CALLS_ENABLED=false` — аварийный, без деплоя
   * настроек; строка `ChatSettings` — из админки. Настройка кэшируется на
   * десять секунд: читать её на каждый ICE-кандидат незачем.
   */
  async isEnabled(): Promise<boolean> {
    if ((this.config.get<string>('CALLS_ENABLED') ?? 'true') === 'false')
      return false;
    return (await this.settings()).callsEnabled;
  }

  private settingsCache: {
    value: { callsEnabled: boolean };
    at: number;
  } | null = null;

  private async settings(): Promise<{ callsEnabled: boolean }> {
    if (this.settingsCache && Date.now() - this.settingsCache.at < 10_000)
      return this.settingsCache.value;
    const row = await this.prisma.chatSettings.findUnique({
      where: { id: 'global' },
      select: { callsEnabled: true },
    });
    const value = { callsEnabled: row?.callsEnabled ?? true };
    this.settingsCache = { value, at: Date.now() };
    return value;
  }

  async updateSettings(
    dto: UpdateChatCallSettingsRequest,
  ): Promise<AdminChatCallsState> {
    await this.prisma.chatSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global', callsEnabled: Boolean(dto.callsEnabled) },
      update: { callsEnabled: Boolean(dto.callsEnabled) },
    });
    this.settingsCache = null;
    return this.adminOverview();
  }

  async adminOverview(): Promise<AdminChatCallsState> {
    const [calls, stats, settings] = await Promise.all([
      this.listForAdmin(100),
      this.statsForAdmin(7),
      this.settings(),
    ]);
    return {
      callsEnabled: settings.callsEnabled,
      turnConfigured: Boolean(
        this.config.get<string>('TURN_HOST') &&
        this.config.get<string>('TURN_SECRET'),
      ),
      stats,
      calls,
    };
  }

  // ---------- публичные операции ----------

  async start(userId: string, dto: StartChatCallRequest): Promise<ChatCallDto> {
    if (!(await this.isEnabled()))
      throw new ServiceUnavailableException('Звонки временно выключены');
    if (dto.kind !== 'audio' && dto.kind !== 'video')
      throw new BadRequestException('Неизвестный вид звонка');

    const conversation = await this.conversations.requireConversation(
      dto.conversationId,
      userId,
    );
    if (conversation.kind !== 'direct')
      throw new BadRequestException('Звонить можно только в личном диалоге');

    const mine = conversation.members.find((m) => m.userId === userId);
    const companion = conversation.members.find(
      (m) => m.userId !== userId && !m.leftAt,
    );
    if (!companion)
      throw new BadRequestException('Собеседник вышел из диалога');

    // Те же правила, что у права писать: заблокированному, отклонённому и
    // ждущему ответа на запрос звонить нельзя.
    const denial = denyWrite(
      {
        kind: conversation.kind,
        state: conversation.state,
        requestedById: conversation.requestedById,
        messageCount:
          conversation.state === 'request'
            ? await this.prisma.chatMessage.count({
                where: { conversationId: conversation.id },
              })
            : undefined,
        blocked: await this.blockedBetween(userId, companion.userId),
      },
      mine
        ? { userId: mine.userId, role: mine.role, leftAt: mine.leftAt }
        : null,
    );
    if (denial) throw new ForbiddenException(WRITE_DENIAL_TEXT[denial]);
    if (conversation.state === 'request')
      throw new ForbiddenException('Сначала дождитесь ответа на запрос');

    // Занятость: сначала себя, потом собеседника. Не удалось второе —
    // отпускаем первое, иначе человек останется «занят» без звонка.
    const callId = randomUUID();
    if (!(await this.acquireBusy(userId, callId, BUSY_TTL_RINGING_MS)))
      throw new ConflictException('У вас уже идёт звонок');
    if (
      !(await this.acquireBusy(companion.userId, callId, BUSY_TTL_RINGING_MS))
    ) {
      await this.releaseBusy(userId, callId);
      throw new ConflictException('Собеседник сейчас занят');
    }

    const row = await this.prisma.chatCall.create({
      data: {
        id: callId,
        conversationId: conversation.id,
        callerId: userId,
        calleeId: companion.userId,
        kind: dto.kind,
      },
      include: callInclude,
    });

    const dtoOut = toCallDto(row);
    this.events.publish([row.callerId, row.calleeId], {
      type: 'call.ringing',
      call: dtoOut,
    });
    // Беззвучная беседа звонок больше не гасит (VED-361): «без звука» — это
    // про поток сообщений, а вызов ждать до утра нельзя. Выключить звонки
    // человек может отдельным тумблером «Звонки» в настройках уведомлений —
    // его уважает доставка (`notifications/delivery-rule.ts`).
    await this.notifyIncoming(row);
    this.armRingTimer(row.id);
    return dtoOut;
  }

  async accept(userId: string, callId: string): Promise<ChatCallDto> {
    const row = await this.requireCall(callId, userId);
    const fresh = await this.expireIfStale(row);
    const next = transition(fresh.status, 'accept', roleOf(fresh, userId)!);
    if (!next) throw new ConflictException(this.denialText(fresh.status));

    const updated = await this.prisma.chatCall.update({
      where: { id: callId },
      data: { status: 'accepted', answeredAt: new Date() },
      include: callInclude,
    });
    this.disarmRingTimer(callId);
    await Promise.all([
      this.refreshBusy(updated.callerId, callId, BUSY_TTL_ACTIVE_MS),
      this.refreshBusy(updated.calleeId, callId, BUSY_TTL_ACTIVE_MS),
    ]);
    const dtoOut = toCallDto(updated);
    this.events.publish([updated.callerId, updated.calleeId], {
      type: 'call.accepted',
      call: dtoOut,
    });
    // Принявшее устройство — не единственное: у вызываемого мог звонить и
    // телефон с data-пушом. Гасим рингтон на остальных его устройствах.
    this.notifyCallEnded(updated.calleeId, callId, 'answered_elsewhere');
    return dtoOut;
  }

  async decline(userId: string, callId: string): Promise<ChatCallDto> {
    const row = await this.requireCall(callId, userId);
    return this.applyEnd(await this.expireIfStale(row), userId, 'decline');
  }

  async end(
    userId: string,
    callId: string,
    dto: EndChatCallRequest = {},
  ): Promise<ChatCallDto> {
    const row = await this.requireCall(callId, userId);
    return this.applyEnd(
      await this.expireIfStale(row),
      userId,
      'end',
      dto.reason ?? 'hangup',
      dto.relayed,
    );
  }

  /**
   * Перенести offer/answer/ICE второй стороне. Сервер содержимое не
   * разбирает; проверяет только, что это участник живого звонка и что
   * посылка разумного размера (в байтах — `Buffer.byteLength`, не в
   * UTF-16 code units: не-ASCII в `sdp`/`candidate` не должен вдвое смягчать
   * заявленный лимит).
   *
   * Помимо рассылки в `/chat/stream`, сигнал ещё и откладывается в очередь
   * получателя (`storeSignal`) с растущим `seq` — если в момент рассылки
   * поток получателя не был подключён (обрыв, медленная сеть, только что
   * запущенное приложение), событие уйдёт в пустоту, но останется доступно
   * через `signalsSince`. Когда Redis настроен, он — единственный источник
   * правды для этого (см. класс-докстрингу выше): `nextSignalSeq`/
   * `storeSignal` при сбое Redis не подменяют его локальной памятью молча —
   * они бросают `ServiceUnavailableException` (503), и клиент обязан
   * повторить `POST /signal` сам, а не получить сигнал, потерянный на
   * инстансе, который следующий `GET /signals` может даже не увидеть.
   *
   * Именно этот повтор и требует `clientSignalId` (VED-261, feedback-002):
   * клиент, получивший 503 (или любую другую сетевую ошибку) уже ПОСЛЕ того,
   * как сервер успешно выполнил `nextSignalSeq`/`storeSignal` — классический
   * «write succeeded, response lost» — раньше получал бы второй, независимый
   * `seq` на тот же самый offer/answer/ICE-кандидат при повторе. Дедупликация
   * клиента (`admitCallSignal`) сравнивает только `seq` монотонно, содержимое
   * не знает — второй экземпляр прошёл бы как «новый» сигнал и мог бы
   * запустить незапрошенную повторную реегоциацию (лишний `answer`,
   * `InvalidStateError` у второй стороны). `claimClientSignal` делает
   * повторную доставку С ТЕМ ЖЕ `clientSignalId` идемпотентным no-op:
   * ничего не выдаёт, не сохраняет и не публикует повторно.
   */
  async signal(
    userId: string,
    callId: string,
    signal: ChatCallSignal,
    clientSignalId?: string,
  ): Promise<void> {
    if (!isSignal(signal)) throw new BadRequestException('Неверный сигнал');
    if (Buffer.byteLength(JSON.stringify(signal), 'utf8') > MAX_SIGNAL_BYTES)
      throw new BadRequestException('Сигнал слишком большой');

    const row = await this.requireCall(callId, userId);
    if (isFinal(row.status)) throw new ConflictException('Звонок уже завершён');

    const idempotencyKey = normalizeClientSignalId(clientSignalId);
    if (idempotencyKey) {
      const isFirstDelivery = await this.claimClientSignal(
        callId,
        userId,
        idempotencyKey,
      );
      // Уже обработан на предыдущей попытке — тот сигнал (offer/answer/
      // кандидат) уже выдан, сохранён и разослан ровно один раз; здесь
      // отвечаем 204, как и на «настоящий» успех, ничего больше не делая.
      if (!isFirstDelivery) return;
    }

    const to = row.callerId === userId ? row.calleeId : row.callerId;
    const seq = await this.nextSignalSeq(callId);
    await this.storeSignal(callId, to, { seq, fromUserId: userId, signal });
    this.events.publish([to], {
      type: 'call.signal',
      callId,
      fromUserId: userId,
      signal,
      seq,
    });
  }

  /**
   * Сигналы этого звонка, адресованные вызывающему, начиная со `seq`
   * строго больше `after`, по возрастанию. Участник может дочитать их в
   * любой фазе — то, что звонок уже завершился к моменту запроса, не повод
   * отказывать: `readSignals` в этом случае просто вернёт пусто (очередь
   * уже очищена `finish()`), а не 409. При сбое чтения из настроенного
   * Redis — 503 (`readSignals`), а не молчаливый пустой список: клиент
   * повторит запрос при следующем переподключении потока или таймауте
   * `connecting`, а не решит, что сигналов действительно не было.
   */
  async signalsSince(
    userId: string,
    callId: string,
    after: number,
  ): Promise<ChatCallSignalEnvelope[]> {
    await this.requireCall(callId, userId);
    const entries = await this.readSignals(callId, userId);
    return entries
      .filter((entry) => entry.seq > after)
      .sort((a, b) => a.seq - b.seq)
      .map(({ seq, fromUserId, signal }) => ({ seq, fromUserId, signal }));
  }

  /** Незавершённый звонок человека — чтобы вкладка после перезагрузки
   *  показала входящий или вернулась в разговор. */
  async active(userId: string): Promise<ChatCallDto | null> {
    const row = await this.prisma.chatCall.findFirst({
      where: {
        OR: [{ callerId: userId }, { calleeId: userId }],
        status: { in: ['ringing', 'accepted'] },
        createdAt: { gte: new Date(Date.now() - BUSY_TTL_ACTIVE_MS) },
      },
      orderBy: { createdAt: 'desc' },
      include: callInclude,
    });
    if (!row) return null;
    const fresh = await this.expireIfStale(row);
    return isFinal(fresh.status) ? null : toCallDto(fresh);
  }

  /**
   * История звонков человека: и свои, и входящие, свежие сверху.
   *
   * Звонок начинается внутри диалога, поэтому без этого списка вспомнить, кто
   * звонил вчера, было негде — оставалось листать переписку.
   */
  async historyForUser(userId: string, limit = 50): Promise<ChatCallDto[]> {
    const rows = await this.prisma.chatCall.findMany({
      where: { OR: [{ callerId: userId }, { calleeId: userId }] },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: callInclude,
    });
    return rows.map(toCallDto);
  }

  /** Раздел админки: последние звонки. */
  async listForAdmin(limit = 100): Promise<ChatCallDto[]> {
    const rows = await this.prisma.chatCall.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
      include: callInclude,
    });
    return rows.map(toCallDto);
  }

  /** Раздел админки: сводка за период. */
  async statsForAdmin(sinceDays = 7): Promise<AdminChatCallStats> {
    const since = new Date(Date.now() - sinceDays * 86_400_000);
    const rows = await this.prisma.chatCall.findMany({
      where: { createdAt: { gte: since } },
      select: {
        status: true,
        relayed: true,
        answeredAt: true,
        endedAt: true,
      },
    });
    const byStatus: Partial<Record<ChatCallStatus, number>> = {};
    let relayed = 0;
    let relayKnown = 0;
    let talkSeconds = 0;
    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      if (r.relayed !== null) {
        relayKnown += 1;
        if (r.relayed) relayed += 1;
      }
      if (r.answeredAt && r.endedAt)
        talkSeconds += Math.max(
          0,
          Math.round((r.endedAt.getTime() - r.answeredAt.getTime()) / 1000),
        );
    }
    return {
      sinceDays,
      total: rows.length,
      byStatus,
      relayedShare: relayKnown ? relayed / relayKnown : null,
      talkSeconds,
    };
  }

  // ---------- внутреннее ----------

  private async applyEnd(
    row: ChatCallRow,
    userId: string,
    action: Extract<CallAction, 'decline' | 'end'>,
    reason: ChatCallEndReason = 'hangup',
    relayed?: boolean,
  ): Promise<ChatCallDto> {
    const role = roleOf(row, userId)!;
    const next = transition(row.status, action, role, reason);
    if (!next) {
      // Завершать уже завершённый — не ошибка для клиента: обе стороны
      // жмут «положить трубку» почти одновременно.
      if (isFinal(row.status)) return toCallDto(row);
      throw new ConflictException(this.denialText(row.status));
    }
    return this.finish(row, next.status, next.endReason, userId, relayed);
  }

  /** Единая точка финала: статус, отметки, лента, события, занятость. */
  private async finish(
    row: ChatCallRow,
    status: ChatCallStatus,
    endReason: ChatCallEndReason | null,
    endedById: string | null,
    relayed?: boolean,
  ): Promise<ChatCallDto> {
    // Гонка двух финалов (таймер и «отклонить» в одну секунду): побеждает
    // тот, кто первым перевёл строку из нефинального состояния.
    const claimed = await this.prisma.chatCall.updateMany({
      where: { id: row.id, status: { in: ['ringing', 'accepted'] } },
      data: {
        status,
        endReason,
        endedById,
        endedAt: new Date(),
        ...(relayed === undefined ? {} : { relayed }),
      },
    });
    this.disarmRingTimer(row.id);
    const updated = await this.prisma.chatCall.findUniqueOrThrow({
      where: { id: row.id },
      include: callInclude,
    });
    // Идемпотентно и на гонке (claimed.count === 0 — кто-то уже дофиналил
    // звонок): сигналинг завершённого звонка не нужен никому, очистка не
    // должна ждать, кто именно выиграл гонку финалов.
    await this.clearSignals(updated);
    if (claimed.count === 0) return toCallDto(updated);

    await Promise.all([
      this.releaseBusy(updated.callerId, updated.id),
      this.releaseBusy(updated.calleeId, updated.id),
    ]);
    const dtoOut = toCallDto(updated);
    this.events.publish([updated.callerId, updated.calleeId], {
      type: 'call.ended',
      call: dtoOut,
    });
    void this.recordInThread(updated);
    if (status === 'missed') this.notifyMissed(updated);
    // Гасим рингтон на нативных устройствах обеих сторон: у вызываемого
    // могли звонить ещё телефоны, у звонившего — отменённый вызов мог
    // остаться на другом его устройстве.
    const reason = callEndedPushReason(status);
    if (reason) {
      this.notifyCallEnded(updated.calleeId, updated.id, reason);
      this.notifyCallEnded(updated.callerId, updated.id, reason);
    }
    return dtoOut;
  }

  /**
   * Запись в ленту диалога от лица звонившего. Пуша нет: о пропущенном
   * отдельно скажет `chat.call-missed`, о состоявшемся напоминать незачем.
   */
  private async recordInThread(call: ChatCallRow): Promise<void> {
    try {
      const summary = callSummary(call);
      const created = await this.prisma.chatMessage.create({
        data: {
          conversationId: call.conversationId,
          authorId: call.callerId,
          body: summary.body,
          attachments: {
            create: [
              {
                kind: 'call',
                title: summary.title,
                subtitle: summary.subtitle,
                sourceService: 'chat',
                sourceId: call.id,
                waveform: [],
                position: 0,
              },
            ],
          },
        },
        include: chatMessageInclude,
      });
      await this.prisma.chatConversation.update({
        where: { id: call.conversationId },
        data: { lastMessageAt: created.createdAt },
      });
      // Звонивший свою запись «прочитал»; у второй стороны пропущенный
      // остаётся непрочитанным — так его видно в списке бесед.
      await this.prisma.chatMember.updateMany({
        where: { conversationId: call.conversationId, userId: call.callerId },
        data: { lastReadAt: created.createdAt },
      });
      this.events.publish([call.callerId, call.calleeId], {
        type: 'message.created',
        conversationId: call.conversationId,
        message: toMessageDto(created, call.callerId),
      });
    } catch (error) {
      this.logger.warn(
        `Запись о звонке ${call.id} не попала в ленту: ${String(error)}`,
      );
    }
  }

  private async requireCall(
    callId: string,
    userId: string,
  ): Promise<ChatCallRow> {
    const row = await this.prisma.chatCall.findUnique({
      where: { id: callId },
      include: callInclude,
    });
    if (!row || !roleOf(row, userId))
      throw new NotFoundException('Звонок не найден');
    return row;
  }

  /**
   * Дозвон, переживший свой таймер (процесс перезапустился) — пропущенный.
   * Небольшой запас сверх таймера, чтобы не обогнать живой таймер соседа.
   */
  private async expireIfStale(row: ChatCallRow): Promise<ChatCallRow> {
    if (row.status !== 'ringing') return row;
    if (Date.now() - row.createdAt.getTime() < RING_TIMEOUT_MS + 5_000)
      return row;
    await this.finish(row, 'missed', 'timeout', null);
    return this.prisma.chatCall.findUniqueOrThrow({
      where: { id: row.id },
      include: callInclude,
    });
  }

  private armRingTimer(callId: string): void {
    this.disarmRingTimer(callId);
    const timer = setTimeout(() => {
      this.ringTimers.delete(callId);
      void this.timeout(callId);
    }, RING_TIMEOUT_MS);
    // Таймер не должен держать процесс при остановке.
    timer.unref?.();
    this.ringTimers.set(callId, timer);
  }

  private disarmRingTimer(callId: string): void {
    const timer = this.ringTimers.get(callId);
    if (timer) clearTimeout(timer);
    this.ringTimers.delete(callId);
  }

  private async timeout(callId: string): Promise<void> {
    try {
      const row = await this.prisma.chatCall.findUnique({
        where: { id: callId },
        include: callInclude,
      });
      if (!row) return;
      const next = transition(row.status, 'timeout', 'caller');
      if (!next) return;
      await this.finish(row, next.status, next.endReason, null);
    } catch (error) {
      this.logger.warn(`Таймер дозвона ${callId}: ${String(error)}`);
    }
  }

  private denialText(status: ChatCallStatus): string {
    if (isFinal(status)) return 'Звонок уже завершён';
    if (status === 'accepted') return 'Звонок уже принят';
    return 'Действие недоступно для этого звонка';
  }

  private async blockedBetween(a: string, b: string): Promise<boolean> {
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
      select: { id: true },
    });
    return Boolean(block);
  }

  private async notifyIncoming(row: ChatCallRow): Promise<void> {
    const event: NotificationEvent = {
      name: 'chat.call-incoming',
      recipientId: row.calleeId,
      callerName: resolveDisplayName(row.caller),
      // Экран вызова рисует фото звонящего; загруженное — подписью (VED-492).
      callerAvatarUrl: await this.avatars.resolveAvatarUrl({
        avatarKey: row.caller.avatarKey ?? null,
        avatarUrl: row.caller.avatarUrl,
      }),
      callId: row.id,
      conversationId: row.conversationId,
      callKind: row.kind,
      // RING_TIMEOUT_MS — тот же таймер, что кладёт звонок в `missed`:
      // нативный экран вызова не должен звонить дольше, чем сервер сам
      // считает дозвон живым.
      expiresAt: new Date(
        row.createdAt.getTime() + RING_TIMEOUT_MS,
      ).toISOString(),
    };
    this.bus.emit(event.name, event);
  }

  private notifyMissed(row: ChatCallRow): void {
    const event: NotificationEvent = {
      name: 'chat.call-missed',
      recipientId: row.calleeId,
      callerName: resolveDisplayName(row.caller),
      conversationId: row.conversationId,
      callKind: row.kind,
    };
    this.bus.emit(event.name, event);
  }

  /**
   * Сигнал «звонок снят» — вне общего конвейера уведомлений (см.
   * `CHAT_CALL_ENDED_EVENT` в `@vedamatch/shared`): гасит рингтон на
   * нативных устройствах получателя, которые не участвуют в разговоре.
   */
  private notifyCallEnded(
    recipientId: string,
    callId: string,
    reason: ChatCallEndedEvent['reason'],
  ): void {
    const event: ChatCallEndedEvent = {
      name: CHAT_CALL_ENDED_EVENT,
      recipientId,
      callId,
      reason,
    };
    this.bus.emit(event.name, event);
  }

  // ---------- занятость ----------

  private async acquireBusy(
    userId: string,
    callId: string,
    ttlMs: number,
  ): Promise<boolean> {
    if (this.redis?.status === 'ready') {
      try {
        const result = await this.redis.set(
          `${BUSY_PREFIX}${userId}`,
          callId,
          'PX',
          ttlMs,
          'NX',
        );
        return result === 'OK';
      } catch (error) {
        this.logger.warn(`Занятость не записана: ${String(error)}`);
        return true;
      }
    }
    const entry = this.localBusy.get(userId);
    if (entry && entry.expiresAt > Date.now() && entry.callId !== callId)
      return false;
    this.localBusy.set(userId, { callId, expiresAt: Date.now() + ttlMs });
    return true;
  }

  private async refreshBusy(
    userId: string,
    callId: string,
    ttlMs: number,
  ): Promise<void> {
    if (this.redis?.status === 'ready') {
      await this.redis
        .set(`${BUSY_PREFIX}${userId}`, callId, 'PX', ttlMs)
        .catch((error) =>
          this.logger.warn(`Занятость не продлена: ${String(error)}`),
        );
      return;
    }
    this.localBusy.set(userId, { callId, expiresAt: Date.now() + ttlMs });
  }

  private async releaseBusy(userId: string, callId: string): Promise<void> {
    if (this.redis?.status === 'ready') {
      try {
        const key = `${BUSY_PREFIX}${userId}`;
        if ((await this.redis.get(key)) === callId) await this.redis.del(key);
      } catch (error) {
        this.logger.warn(`Занятость не снята: ${String(error)}`);
      }
      return;
    }
    if (this.localBusy.get(userId)?.callId === callId)
      this.localBusy.delete(userId);
  }

  // ---------- сигналы звонка (VED-261) ----------

  /**
   * Не подменяет отсутствие Redis (`this.redis === null` — не настроен
   * вовсе, законный локальный режим) с его сбоем (клиент есть, команда
   * упала). Только второе — повод для короткого повтора и, если он не
   * помог, для 503: см. класс-докстринг про единственный источник правды.
   */
  private async withRedisRetry<T>(
    op: () => Promise<T>,
    attempts = 2,
    delayMs = 120,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await op();
      } catch (error) {
        lastError = error;
        if (attempt < attempts - 1)
          await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastError;
  }

  /**
   * Идемпотентность одного клиентского сигнала (VED-261, feedback-002,
   * блокирующий п.1): возвращает `true` РОВНО ОДИН РАЗ для пары
   * `(callId, userId, clientSignalId)` — на первый вызов. Любой следующий
   * вызов с теми же тремя значениями (партиальный успех — сервер уже
   * обработал сигнал, а ответ клиенту не дошёл, и клиент честно повторил
   * тот же `POST /signal`) возвращает `false`, и `signal()` не выдаёт новый
   * `seq`, не сохраняет и не публикует сигнал заново.
   *
   * `SET key NX` — атомарная заявка: не «прочитать, потом решить», а «занять
   * слот, и только победитель гонки продолжает». Значение под ключом не
   * несёт смысла (не `seq` — вызывающему коду он не нужен, `POST /signal`
   * ничего не возвращает, 204) — это чистый маркер «уже видели». TTL — тот
   * же, что у самих сигналов: ключ переживает звонок ненадолго, отдельная
   * очистка в `finish()` не заведена намеренно — `clientSignalId` в звонке
   * может быть многие десятки (по одному на каждый ICE-кандидат), а не
   * фиксированный набор из двух записей, как у `caller`/`callee` в
   * `clearSignals` — TTL здесь честнее, чем пытаться перечислить все ключи.
   */
  private async claimClientSignal(
    callId: string,
    userId: string,
    clientSignalId: string,
  ): Promise<boolean> {
    if (this.redis) {
      try {
        const key = `${SIGNAL_IDEMPOTENCY_PREFIX}${callId}:${userId}:${clientSignalId}`;
        const result = await this.withRedisRetry(() =>
          this.redis!.set(key, '1', 'PX', BUSY_TTL_ACTIVE_MS, 'NX'),
        );
        return result === 'OK';
      } catch (error) {
        this.logger.error(
          `Идемпотентность сигнала не проверена через Redis после повторов: ${String(error)}`,
        );
        throw new ServiceUnavailableException(
          'Не удалось сохранить сигнал — попробуйте ещё раз',
        );
      }
    }
    this.pruneStaleLocalSignals();
    const seen = this.localIdempotentSignals.get(callId) ?? new Set<string>();
    this.localIdempotentSignals.set(callId, seen);
    const member = `${userId}:${clientSignalId}`;
    if (seen.has(member)) return false;
    seen.add(member);
    this.touchLocalSignals(callId);
    return true;
  }

  /**
   * Общий счётчик `seq` на звонок (не на получателя): порядок среди
   * сигналов ОДНОГО адресата от этого остаётся строго возрастающим — то,
   * что нужно клиенту для `after=` — а с Redis `INCR` он ещё и атомарен
   * между инстансами, где один POST /signal мог обработать инстанс A, а
   * другой — инстанс B. Redis настроен → он единственный источник: сбой
   * `INCR` после повтора превращается в 503, а не в рассинхронизированный
   * локальный счётчик с нуля (тот мог бы выдать `seq`, уже виденный
   * клиентом, и новый сигнал молча отбросился бы дедупликацией на клиенте).
   */
  private async nextSignalSeq(callId: string): Promise<number> {
    if (this.redis) {
      try {
        return await this.withRedisRetry(() =>
          this.redis!.incr(`${SIGNAL_SEQ_PREFIX}${callId}`),
        );
      } catch (error) {
        this.logger.error(
          `Seq сигнала не выдан через Redis после повторов: ${String(error)}`,
        );
        throw new ServiceUnavailableException(
          'Не удалось сохранить сигнал — попробуйте ещё раз',
        );
      }
    }
    this.pruneStaleLocalSignals();
    const next = (this.localSignalSeq.get(callId) ?? 0) + 1;
    this.localSignalSeq.set(callId, next);
    this.touchLocalSignals(callId);
    return next;
  }

  private async storeSignal(
    callId: string,
    toUserId: string,
    entry: StoredCallSignal,
  ): Promise<void> {
    if (this.redis) {
      try {
        const key = `${SIGNAL_PREFIX}${callId}:${toUserId}`;
        await this.withRedisRetry(() =>
          this.redis!.multi()
            .rpush(key, JSON.stringify(entry))
            // Последние MAX_SIGNALS_PER_RECIPIENT — LTRIM с отрицательным
            // началом держит хвост списка, а не голову.
            .ltrim(key, -MAX_SIGNALS_PER_RECIPIENT, -1)
            // TTL — подстраховка на случай, если finish() не выполнится
            // (упавший процесс): та же продолжительность, что у «занятости»
            // принятого звонка, самого долгого случая.
            .expire(key, Math.ceil(BUSY_TTL_ACTIVE_MS / 1000))
            .exec(),
        );
        return;
      } catch (error) {
        this.logger.error(
          `Сигнал не сохранён в Redis после повторов: ${String(error)}`,
        );
        throw new ServiceUnavailableException(
          'Не удалось сохранить сигнал — попробуйте ещё раз',
        );
      }
    }
    this.pruneStaleLocalSignals();
    const byRecipient =
      this.localSignals.get(callId) ?? new Map<string, StoredCallSignal[]>();
    this.localSignals.set(callId, byRecipient);
    const list = byRecipient.get(toUserId) ?? [];
    list.push(entry);
    if (list.length > MAX_SIGNALS_PER_RECIPIENT) list.shift();
    byRecipient.set(toUserId, list);
    this.touchLocalSignals(callId);
  }

  private async readSignals(
    callId: string,
    toUserId: string,
  ): Promise<StoredCallSignal[]> {
    if (this.redis) {
      try {
        const raw = await this.withRedisRetry(() =>
          this.redis!.lrange(`${SIGNAL_PREFIX}${callId}:${toUserId}`, 0, -1),
        );
        return raw
          .map((item) => this.parseStoredSignal(item))
          .filter((entry): entry is StoredCallSignal => entry !== null);
      } catch (error) {
        this.logger.error(
          `Сигналы не прочитаны из Redis после повторов: ${String(error)}`,
        );
        // Не пустой список: пустой ответ клиент читает как «сигналов не
        // было» и не повторит запрос — 503 говорит клиенту «попробуй ещё
        // раз» (следующий reconnect потока или таймаут `connecting`), что
        // и есть правда — мы не знаем, были сигналы или нет.
        throw new ServiceUnavailableException(
          'Не удалось получить сигналы — попробуйте ещё раз',
        );
      }
    }
    this.pruneStaleLocalSignals();
    return this.localSignals.get(callId)?.get(toUserId) ?? [];
  }

  private parseStoredSignal(raw: string): StoredCallSignal | null {
    try {
      return JSON.parse(raw) as StoredCallSignal;
    } catch {
      return null;
    }
  }

  /** Вызывается из `finish()` — сигналинг завершённого звонка не нужен. */
  private async clearSignals(row: {
    id: string;
    callerId: string;
    calleeId: string;
  }): Promise<void> {
    this.localSignalSeq.delete(row.id);
    this.localSignals.delete(row.id);
    this.localSignalsTouchedAt.delete(row.id);
    this.localIdempotentSignals.delete(row.id);
    if (this.redis) {
      try {
        await this.redis.del(
          `${SIGNAL_SEQ_PREFIX}${row.id}`,
          `${SIGNAL_PREFIX}${row.id}:${row.callerId}`,
          `${SIGNAL_PREFIX}${row.id}:${row.calleeId}`,
        );
      } catch (error) {
        // Best-effort: `finish()` не должен падать из-за уборки сигналов —
        // EXPIRE в storeSignal уже подстраховывает на случай, если это не
        // получится вовсе (см. класс-докстринг).
        this.logger.warn(`Сигналы не очищены в Redis: ${String(error)}`);
      }
    }
  }

  /**
   * TTL для локального режима без Redis (см. класс-докстринг):
   * подстраховка на случай, если `finish()` для конкретного звонка почему-то
   * не вызвался. Ленивая проверка при каждом локальном обращении — тот же
   * приём, что уже используется в этом файле для истекшего `ringing`
   * (`expireIfStale`), а не отдельный таймер: без Redis это всегда один
   * процесс, периодический `setInterval` добавил бы ещё один источник
   * состояния без выигрыша в точности.
   */
  private touchLocalSignals(callId: string): void {
    this.localSignalsTouchedAt.set(callId, Date.now());
  }

  private pruneStaleLocalSignals(): void {
    const now = Date.now();
    for (const [callId, touchedAt] of this.localSignalsTouchedAt) {
      if (now - touchedAt > BUSY_TTL_ACTIVE_MS) {
        this.localSignalsTouchedAt.delete(callId);
        this.localSignalSeq.delete(callId);
        this.localSignals.delete(callId);
        this.localIdempotentSignals.delete(callId);
      }
    }
  }
}

function toCallDto(row: ChatCallRow): ChatCallDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    kind: row.kind,
    status: row.status,
    caller: toUserSummary(row.caller),
    callee: toUserSummary(row.callee),
    createdAt: row.createdAt.toISOString(),
    answeredAt: row.answeredAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    endReason: (row.endReason as ChatCallEndReason | null) ?? null,
  };
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
  // VED-291: состояние камеры отправителя. Сервер, как и для sdp/candidate,
  // содержимое не интерпретирует — только проверяет форму и переносит
  // второй стороне. Без этой строки валидатор отвечал бы 400 «Неверный
  // сигнал», и сообщить о выключенной камере было бы нечем: своего канала
  // (data channel) у звонка нет, а подмешивать это в SDP значило бы гонять
  // полную реегоциацию на каждое нажатие кнопки.
  if (v.kind === 'media') {
    const m = v.media as Record<string, unknown> | undefined;
    return Boolean(m) && typeof m!.video === 'boolean';
  }
  return false;
}

/**
 * `clientSignalId` необязателен и приходит от клиента как есть — не
 * валидная/чужеродная строка молча не участвует в идемпотентности (сигнал
 * просто обрабатывается как раньше, без дедупликации повтора), а не роняет
 * запрос 400: клиент старой версии/без ключа не должен внезапно сломаться.
 */
function normalizeClientSignalId(value: unknown): string | null {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_CLIENT_SIGNAL_ID_LENGTH
    ? value
    : null;
}
