import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type Redis from 'ioredis';
import type { ChatCallSignal } from '@vedamatch/shared';

/**
 * Очередь сигналов групповой комнаты — то же устройство, что у звонка один
 * на один (`chat-calls.service.ts`, VED-261), отдельным объектом.
 *
 * Почему не переиспользуются приватные методы того сервиса: контракт
 * сервисного модуля запрещает тянуть чужое устройство ради экономии строк
 * даже внутри одного модуля — а здесь ещё и отличается ключ (сигнал в mesh
 * адресован конкретному участнику, а не «второй стороне»). Скопировано
 * сознательно и с теми же гарантиями:
 *
 * - Redis настроен → он ЕДИНСТВЕННЫЙ источник правды. Сбой команды после
 *   короткого повтора превращается в 503, а не в молчаливую подмену
 *   локальной картой: разошедшиеся инстансы за Traefik — это та же потеря
 *   сигнала, только новым путём.
 * - Redis не настроен вовсе (dev, один инстанс) → память процесса с
 *   ленивой TTL-очисткой.
 */

export interface StoredGroupSignal {
  seq: number;
  fromUserId: string;
  signal: ChatCallSignal;
}

const SEQ_PREFIX = 'chat:group-call:signal-seq:';
const QUEUE_PREFIX = 'chat:group-call:signals:';
const IDEMPOTENCY_PREFIX = 'chat:group-call:signal-idem:';

/**
 * Хвост очереди получателя — длиннее, чем у звонка один на один (50): у
 * участника mesh'а до трёх собеседников, и его очередь наполняют три
 * источника ICE-кандидатов сразу.
 */
const MAX_SIGNALS_PER_RECIPIENT = 80;

/** Столько же, сколько «занятость» принятого звонка: самый долгий случай. */
export const GROUP_SIGNAL_TTL_MS = 6 * 60 * 60_000;

export class GroupCallSignalStore {
  private readonly logger = new Logger(GroupCallSignalStore.name);
  private readonly localSeq = new Map<string, number>();
  private readonly localQueues = new Map<
    string,
    Map<string, StoredGroupSignal[]>
  >();
  private readonly localIdempotency = new Map<string, Set<string>>();
  private readonly localTouchedAt = new Map<string, number>();

  constructor(private readonly redis: Redis | null) {}

  /** `true` ровно один раз на пару (звонок, отправитель, ключ клиента). */
  async claim(
    callId: string,
    userId: string,
    clientSignalId: string,
  ): Promise<boolean> {
    if (this.redis) {
      const key = `${IDEMPOTENCY_PREFIX}${callId}:${userId}:${clientSignalId}`;
      const result = await this.guard(
        () => this.redis!.set(key, '1', 'PX', GROUP_SIGNAL_TTL_MS, 'NX'),
        'Идемпотентность сигнала не проверена',
      );
      return result === 'OK';
    }
    this.pruneStale();
    const seen = this.localIdempotency.get(callId) ?? new Set<string>();
    this.localIdempotency.set(callId, seen);
    const member = `${userId}:${clientSignalId}`;
    if (seen.has(member)) return false;
    seen.add(member);
    this.touch(callId);
    return true;
  }

  /** Общий растущий номер на комнату: порядок внутри очереди адресата. */
  async nextSeq(callId: string): Promise<number> {
    if (this.redis)
      return this.guard(
        () => this.redis!.incr(`${SEQ_PREFIX}${callId}`),
        'Seq сигнала не выдан',
      );
    this.pruneStale();
    const next = (this.localSeq.get(callId) ?? 0) + 1;
    this.localSeq.set(callId, next);
    this.touch(callId);
    return next;
  }

  async store(
    callId: string,
    toUserId: string,
    entry: StoredGroupSignal,
  ): Promise<void> {
    if (this.redis) {
      const key = `${QUEUE_PREFIX}${callId}:${toUserId}`;
      await this.guard(
        () =>
          this.redis!.multi()
            .rpush(key, JSON.stringify(entry))
            .ltrim(key, -MAX_SIGNALS_PER_RECIPIENT, -1)
            .expire(key, Math.ceil(GROUP_SIGNAL_TTL_MS / 1000))
            .exec(),
        'Сигнал не сохранён',
      );
      return;
    }
    this.pruneStale();
    const byRecipient =
      this.localQueues.get(callId) ?? new Map<string, StoredGroupSignal[]>();
    this.localQueues.set(callId, byRecipient);
    const list = byRecipient.get(toUserId) ?? [];
    list.push(entry);
    if (list.length > MAX_SIGNALS_PER_RECIPIENT) list.shift();
    byRecipient.set(toUserId, list);
    this.touch(callId);
  }

  async read(callId: string, toUserId: string): Promise<StoredGroupSignal[]> {
    if (this.redis) {
      const raw = await this.guard(
        () => this.redis!.lrange(`${QUEUE_PREFIX}${callId}:${toUserId}`, 0, -1),
        'Сигналы не прочитаны',
      );
      return raw
        .map((item) => this.parse(item))
        .filter((entry): entry is StoredGroupSignal => entry !== null);
    }
    this.pruneStale();
    return this.localQueues.get(callId)?.get(toUserId) ?? [];
  }

  /**
   * Очередь участника, который вышел: его сигналы больше никому не нужны, а
   * при повторном входе он начнёт с `after=0` и получил бы протухший offer
   * от прошлого захода — тот, что `webrtc-signal-guard` отбросит уже на
   * клиенте, но лучше не присылать вовсе.
   */
  async clearRecipient(callId: string, userId: string): Promise<void> {
    this.localQueues.get(callId)?.delete(userId);
    if (!this.redis) return;
    await this.redis
      .del(`${QUEUE_PREFIX}${callId}:${userId}`)
      .catch((error) =>
        this.logger.warn(`Очередь участника не очищена: ${String(error)}`),
      );
  }

  /** Комната закрылась — сигналинг ей больше не нужен. */
  async clearCall(callId: string, userIds: readonly string[]): Promise<void> {
    this.localSeq.delete(callId);
    this.localQueues.delete(callId);
    this.localIdempotency.delete(callId);
    this.localTouchedAt.delete(callId);
    if (!this.redis) return;
    const keys = [
      `${SEQ_PREFIX}${callId}`,
      ...userIds.map((id) => `${QUEUE_PREFIX}${callId}:${id}`),
    ];
    // Best-effort, как и в звонке один на один: `finish` не должен падать
    // из-за уборки — `expire` в `store` уже подстраховывает.
    await this.redis
      .del(...keys)
      .catch((error) =>
        this.logger.warn(`Сигналы комнаты не очищены: ${String(error)}`),
      );
  }

  private async guard<T>(op: () => Promise<T>, what: string): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await op();
      } catch (error) {
        lastError = error;
        if (attempt === 0)
          await new Promise((resolve) => setTimeout(resolve, 120));
      }
    }
    this.logger.error(
      `${what} через Redis после повторов: ${String(lastError)}`,
    );
    throw new ServiceUnavailableException(
      'Не удалось передать сигнал — попробуйте ещё раз',
    );
  }

  private parse(raw: string): StoredGroupSignal | null {
    try {
      return JSON.parse(raw) as StoredGroupSignal;
    } catch {
      return null;
    }
  }

  private touch(callId: string): void {
    this.localTouchedAt.set(callId, Date.now());
  }

  private pruneStale(): void {
    const now = Date.now();
    for (const [callId, touchedAt] of this.localTouchedAt) {
      if (now - touchedAt <= GROUP_SIGNAL_TTL_MS) continue;
      this.localTouchedAt.delete(callId);
      this.localSeq.delete(callId);
      this.localQueues.delete(callId);
      this.localIdempotency.delete(callId);
    }
  }
}
