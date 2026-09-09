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
  ChatCallEndReason,
  ChatCallSignal,
  ChatCallStatus,
  EndChatCallRequest,
  NotificationEvent,
  StartChatCallRequest,
  UpdateChatCallSettingsRequest,
} from '@vedamatch/shared';
import { resolveDisplayName } from '@vedamatch/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { denyWrite, WRITE_DENIAL_TEXT } from '../chat-access';
import { ChatConversationsService } from '../chat-conversations.service';
import { toMessageDto, toUserSummary } from '../chat-dto';
import { ChatEventsService } from '../chat-events.service';
import { chatMessageInclude, chatUserSelect } from '../chat-selects';
import { callSummary } from './call-summary';
import {
  BUSY_TTL_ACTIVE_MS,
  BUSY_TTL_RINGING_MS,
  RING_TIMEOUT_MS,
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ChatConversationsService,
    private readonly events: ChatEventsService,
    private readonly bus: EventEmitter2,
    private readonly config: ConfigService,
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
    this.notifyIncoming(row, companion.mutedUntil);
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
   * посылка разумного размера.
   */
  async signal(
    userId: string,
    callId: string,
    signal: ChatCallSignal,
  ): Promise<void> {
    if (!isSignal(signal)) throw new BadRequestException('Неверный сигнал');
    if (JSON.stringify(signal).length > MAX_SIGNAL_BYTES)
      throw new BadRequestException('Сигнал слишком большой');

    const row = await this.requireCall(callId, userId);
    if (isFinal(row.status)) throw new ConflictException('Звонок уже завершён');
    const to = row.callerId === userId ? row.calleeId : row.callerId;
    this.events.publish([to], {
      type: 'call.signal',
      callId,
      fromUserId: userId,
      signal,
    });
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

  private notifyIncoming(row: ChatCallRow, mutedUntil: Date | null): void {
    if (mutedUntil && mutedUntil > new Date()) return;
    const event: NotificationEvent = {
      name: 'chat.call-incoming',
      recipientId: row.calleeId,
      callerName: resolveDisplayName(row.caller),
      callId: row.id,
      conversationId: row.conversationId,
      callKind: row.kind,
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
  return false;
}
