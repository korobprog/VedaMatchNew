import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { ChatCallSignal } from '@vedamatch/shared';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { ChatConversationsService } from '../chat-conversations.service';
import type { ChatEventsService } from '../chat-events.service';
import { BUSY_TTL_ACTIVE_MS } from './call-state';
import { ChatCallsService } from './chat-calls.service';

/**
 * Redis-ветка хранения сигналов (VED-261, feedback-001.md, блокирующие
 * п.1-3): когда `REDIS_HOST` задан, Redis обязан быть единственным
 * источником правды — сбой команды не должен молча подменяться локальной
 * картой (`chat-calls.service.spec.ts` покрывает ровно противоположный
 * случай — Redis не настроен вовсе).
 *
 * `ioredis` целиком заменён на управляемую фальшивку: конструктор
 * `ChatCallsService` сам создаёт клиент по `ConfigService`, отдельного пути
 * внедрения зависимости для теста в этом классе нет (тот же приём, что у
 * `ChatEventsService`/`ChatPresenceService` в этом модуле).
 */

interface FakeMultiChain {
  rpush: jest.Mock;
  ltrim: jest.Mock;
  expire: jest.Mock;
  exec: jest.Mock;
}

class FakeRedis {
  status = 'ready';
  /** Настоящее NX/GET/DEL поверх обычной карты — идемпотентность
   *  (`claimClientSignal`) и «занятость» полагаются на реальную семантику
   *  `SET ... NX`, а не на заглушку, всегда отвечающую «OK». */
  private readonly store = new Map<string, string>();
  connect = jest.fn(() => Promise.resolve());
  quit = jest.fn(() => Promise.resolve());
  incr = jest.fn<Promise<number>, [string]>();
  lrange = jest.fn<Promise<string[]>, [string, number, number]>();
  del = jest.fn((...keys: string[]) => {
    let count = 0;
    for (const key of keys) if (this.store.delete(key)) count += 1;
    return Promise.resolve(count);
  });
  get = jest.fn((key: string) => Promise.resolve(this.store.get(key) ?? null));
  set = jest.fn(
    (
      key: string,
      value: string,
      ...rest: unknown[]
    ): Promise<string | null> => {
      const nx = rest.includes('NX');
      if (nx && this.store.has(key)) return Promise.resolve(null);
      this.store.set(key, value);
      return Promise.resolve('OK');
    },
  );
  multiCalls: FakeMultiChain[] = [];
  /** По умолчанию — успех; тест может переопределить `exec` на отказ. */
  multi = jest.fn((): FakeMultiChain => {
    const chain: FakeMultiChain = {
      rpush: jest.fn(() => chain),
      ltrim: jest.fn(() => chain),
      expire: jest.fn(() => chain),
      exec: jest.fn(() => Promise.resolve([[null, 'OK']])),
    };
    this.multiCalls.push(chain);
    return chain;
  });
}

let lastRedis: FakeRedis | null = null;

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(function FakeRedisCtor() {
    lastRedis = new FakeRedis();
    return lastRedis;
  }),
}));

function user(id: string) {
  return {
    id,
    name: id,
    spiritualName: null,
    avatarUrl: null,
    lastSeenAt: null,
  };
}

function callRow(over: Record<string, unknown> = {}) {
  return {
    id: 'call-1',
    conversationId: 'conversation-1',
    callerId: 'caller',
    calleeId: 'callee',
    kind: 'audio',
    status: 'accepted',
    createdAt: new Date('2026-09-17T10:00:00.000Z'),
    answeredAt: new Date('2026-09-17T10:00:01.000Z'),
    endedAt: null,
    endedById: null,
    endReason: null,
    relayed: null,
    caller: user('caller'),
    callee: user('callee'),
    ...over,
  };
}

function fn(impl?: (...args: never[]) => unknown): jest.Mock {
  return jest.fn(impl as never);
}

function buildServiceWithRedis(row = callRow()) {
  let stored = row;

  const prisma = {
    chatCall: {
      findUnique: fn(() => Promise.resolve(stored)),
      findUniqueOrThrow: fn(() => Promise.resolve(stored)),
      create: fn(() => Promise.resolve(stored)),
      update: fn((args: { data: Record<string, unknown> }) => {
        stored = { ...stored, ...args.data };
        return Promise.resolve(stored);
      }),
      updateMany: fn(
        (args: {
          where: { status: { in: string[] } };
          data: Record<string, unknown>;
        }) => {
          if (!args.where.status.in.includes(stored.status))
            return Promise.resolve({ count: 0 });
          stored = { ...stored, ...args.data };
          return Promise.resolve({ count: 1 });
        },
      ),
      findMany: fn(() => Promise.resolve([])),
    },
    chatMessage: { create: fn(() => Promise.reject(new Error('not used'))) },
    chatConversation: { update: fn(() => Promise.resolve({})) },
    chatMember: { updateMany: fn(() => Promise.resolve({})) },
    chatSettings: {
      findUnique: fn(() => Promise.resolve({ callsEnabled: true })),
      upsert: fn(() => Promise.resolve({})),
    },
    userBlock: { findFirst: fn(() => Promise.resolve(null)) },
  } as unknown as PrismaService;

  const events = { publish: jest.fn() };
  const bus = { emit: jest.fn() };
  // `REDIS_HOST` задан — конструктор ChatCallsService создаёт FakeRedis
  // (перехвачен jest.mock выше) и делает его единственным источником правды.
  const config = {
    get: (key: string) => (key === 'REDIS_HOST' ? 'redis-test' : undefined),
  } as unknown as ConfigService;
  const conversations = {} as unknown as ChatConversationsService;

  const service = new ChatCallsService(
    prisma,
    conversations,
    events as unknown as ChatEventsService,
    bus as unknown as EventEmitter2,
    config,
  );
  const redis = lastRedis!;
  return { service, events, redis };
}

const sdpOffer: ChatCallSignal = {
  kind: 'sdp',
  sdp: { type: 'offer', sdp: 'v=0…offer' },
};

describe('ChatCallsService — сигналы через Redis (VED-261)', () => {
  beforeEach(() => {
    lastRedis = null;
  });

  it('успешная запись и чтение — seq и содержимое идут через Redis, не локальную карту', async () => {
    const { service, redis } = buildServiceWithRedis();
    redis.incr.mockResolvedValueOnce(1);
    // storeSignal → multi().rpush()... — по умолчанию FakeRedis успешен.

    await service.signal('caller', 'call-1', sdpOffer);

    expect(redis.incr).toHaveBeenCalledWith('chat:call:signal-seq:call-1');
    expect(redis.multiCalls).toHaveLength(1);
    expect(redis.multiCalls[0].rpush).toHaveBeenCalledWith(
      'chat:call:signals:call-1:callee',
      JSON.stringify({ seq: 1, fromUserId: 'caller', signal: sdpOffer }),
    );
    expect(redis.multiCalls[0].ltrim).toHaveBeenCalledWith(
      'chat:call:signals:call-1:callee',
      -50,
      -1,
    );

    redis.lrange.mockResolvedValueOnce([
      JSON.stringify({ seq: 1, fromUserId: 'caller', signal: sdpOffer }),
    ]);
    const signals = await service.signalsSince('callee', 'call-1', 0);

    expect(redis.lrange).toHaveBeenCalledWith(
      'chat:call:signals:call-1:callee',
      0,
      -1,
    );
    expect(signals).toEqual([
      { seq: 1, fromUserId: 'caller', signal: sdpOffer },
    ]);
  });

  it('повтор с тем же clientSignalId через Redis — идемпотентный no-op, seq не растёт (VED-261, feedback-002)', async () => {
    const { service, redis } = buildServiceWithRedis();
    redis.incr.mockResolvedValueOnce(1);

    await service.signal('caller', 'call-1', sdpOffer, 'client-signal-1');
    // «Партиальный успех»: сервер уже обработал, ответ клиенту потерялся —
    // тот же ключ приходит снова.
    await service.signal('caller', 'call-1', sdpOffer, 'client-signal-1');
    await service.signal('caller', 'call-1', sdpOffer, 'client-signal-1');

    expect(redis.set).toHaveBeenCalledWith(
      'chat:call:signal-idem:call-1:caller:client-signal-1',
      '1',
      'PX',
      BUSY_TTL_ACTIVE_MS,
      'NX',
    );
    // INCR/запись/публикация — только на первую, настоящую попытку.
    expect(redis.incr).toHaveBeenCalledTimes(1);
    expect(redis.multiCalls).toHaveLength(1);
  });

  it('разные clientSignalId для одного звонка/отправителя — разные сигналы', async () => {
    const { service, redis } = buildServiceWithRedis();
    redis.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    await service.signal('caller', 'call-1', sdpOffer, 'client-signal-1');
    await service.signal('caller', 'call-1', sdpOffer, 'client-signal-2');

    expect(redis.incr).toHaveBeenCalledTimes(2);
    expect(redis.multiCalls).toHaveLength(2);
  });

  it('сбой SET на проверке идемпотентности — повтор, затем 503, до INCR дело не доходит', async () => {
    const { service, redis } = buildServiceWithRedis();
    redis.set.mockRejectedValue(new Error('ECONNRESET'));

    await expect(
      service.signal('caller', 'call-1', sdpOffer, 'client-signal-1'),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(redis.set).toHaveBeenCalledTimes(2);
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('INCR падает — повтор (2 попытки), затем 503, sig не сохраняется как локальный', async () => {
    const { service, redis } = buildServiceWithRedis();
    redis.incr.mockRejectedValue(new Error('ECONNRESET'));

    await expect(service.signal('caller', 'call-1', sdpOffer)).rejects.toThrow(
      ServiceUnavailableException,
    );
    // Повтор — не одна попытка и не бесконечность.
    expect(redis.incr).toHaveBeenCalledTimes(2);
    // Раз seq не выдан, до записи сигнала дело не дошло вовсе.
    expect(redis.multiCalls).toHaveLength(0);
  });

  it('RPUSH (multi().exec()) падает — повтор, затем 503', async () => {
    const { service, redis } = buildServiceWithRedis();
    redis.incr.mockResolvedValueOnce(1);
    redis.multi.mockImplementation((): FakeMultiChain => {
      const chain: FakeMultiChain = {
        rpush: jest.fn(() => chain),
        ltrim: jest.fn(() => chain),
        expire: jest.fn(() => chain),
        exec: jest.fn(() => Promise.reject(new Error('write timeout'))),
      };
      return chain;
    });

    await expect(service.signal('caller', 'call-1', sdpOffer)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(redis.multi).toHaveBeenCalledTimes(2);
  });

  it('seq после временного сбоя INCR не выдаётся заново с нуля (следующий успешный вызов продолжает Redis-счётчик)', async () => {
    const { service, redis } = buildServiceWithRedis();
    redis.incr.mockResolvedValueOnce(5); // предыдущие сигналы уже довели счётчик до 5

    await service.signal('caller', 'call-1', sdpOffer);
    expect(redis.multiCalls[0].rpush).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify({ seq: 5, fromUserId: 'caller', signal: sdpOffer }),
    );

    // Сбой — сигнал не сохраняется и не превращается в конкурирующий
    // локальный seq=1: следующий успешный INCR должен вернуть то, что
    // реально скажет Redis (6), а не то, что выдумал бы локальный счётчик.
    redis.incr.mockRejectedValueOnce(new Error('timeout'));
    redis.incr.mockRejectedValueOnce(new Error('timeout'));
    await expect(service.signal('caller', 'call-1', sdpOffer)).rejects.toThrow(
      ServiceUnavailableException,
    );

    redis.incr.mockResolvedValueOnce(6);
    await service.signal('caller', 'call-1', sdpOffer);
    expect(redis.multiCalls[1].rpush).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify({ seq: 6, fromUserId: 'caller', signal: sdpOffer }),
    );
  });

  it('LRANGE падает — повтор, затем 503 (не пустой список)', async () => {
    const { service, redis } = buildServiceWithRedis();
    redis.lrange.mockRejectedValue(new Error('ECONNRESET'));

    await expect(service.signalsSince('callee', 'call-1', 0)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(redis.lrange).toHaveBeenCalledTimes(2);
  });

  it('чужому участнику всё ещё 404 раньше похода в Redis', async () => {
    const { service, redis } = buildServiceWithRedis();

    await expect(
      service.signalsSince('stranger', 'call-1', 0),
    ).rejects.toThrow();
    expect(redis.lrange).not.toHaveBeenCalled();
  });

  it('finish() (через end()) удаляет ключи сигналов в Redis', async () => {
    const { service, redis } = buildServiceWithRedis();

    await service.end('caller', 'call-1', { reason: 'hangup' });

    expect(redis.del).toHaveBeenCalledWith(
      'chat:call:signal-seq:call-1',
      'chat:call:signals:call-1:caller',
      'chat:call:signals:call-1:callee',
    );
  });
});
