import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { ChatCallSignal } from '@vedamatch/shared';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { ChatConversationsService } from '../chat-conversations.service';
import type { ChatEventsService } from '../chat-events.service';
import { CHAT_CALL_ENDED_EVENT } from '@vedamatch/shared';
import { BUSY_TTL_ACTIVE_MS, RING_TIMEOUT_MS } from './call-state';
import { ChatCallsService } from './chat-calls.service';

/**
 * Хранение сигналов звонка (VED-261): без REDIS_HOST сервис обязан
 * работать на памяти процесса — тот же приём, что уже проверен у
 * `ChatPresenceService`/занятости этого же сервиса.
 */

function user(id: string) {
  return {
    id,
    name: id,
    spiritualName: null,
    avatarUrl: null,
    lastSeenAt: null,
  };
}

/** Живой стор, имитирующий поведение Prisma ровно настолько, насколько
 *  нужно `signal`/`signalsSince`/`finish`: создать, найти, обновить статус. */
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

function buildService(row = callRow()) {
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
      findFirst: fn(() => Promise.resolve(stored)),
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
  const config = { get: () => undefined } as unknown as ConfigService;
  const conversations = {} as unknown as ChatConversationsService;

  const service = new ChatCallsService(
    prisma,
    conversations,
    events as unknown as ChatEventsService,
    bus as unknown as EventEmitter2,
    config,
  );
  return { service, events, bus, getRow: () => stored };
}

const sdpOffer: ChatCallSignal = {
  kind: 'sdp',
  sdp: { type: 'offer', sdp: 'v=0…offer' },
};
const sdpAnswer: ChatCallSignal = {
  kind: 'sdp',
  sdp: { type: 'answer', sdp: 'v=0…answer' },
};

describe('ChatCallsService — сигналы активного звонка (VED-261)', () => {
  it('signal() присваивает растущий seq и рассылает его вместе с событием', async () => {
    const { service, events } = buildService();

    await service.signal('caller', 'call-1', sdpOffer);
    await service.signal('caller', 'call-1', {
      kind: 'candidate',
      candidate: { candidate: 'a' },
    });

    expect(events.publish).toHaveBeenNthCalledWith(
      1,
      ['callee'],
      expect.objectContaining({
        type: 'call.signal',
        seq: 1,
        signal: sdpOffer,
      }),
    );
    expect(events.publish).toHaveBeenNthCalledWith(
      2,
      ['callee'],
      expect.objectContaining({ type: 'call.signal', seq: 2 }),
    );
  });

  it('переносит сигнал состояния камеры (VED-291) как есть', async () => {
    const { service, events } = buildService();
    const mediaOff: ChatCallSignal = { kind: 'media', media: { video: false } };

    await service.signal('caller', 'call-1', mediaOff);

    expect(events.publish).toHaveBeenCalledWith(
      ['callee'],
      expect.objectContaining({
        type: 'call.signal',
        seq: 1,
        signal: mediaOff,
      }),
    );
    expect(await service.signalsSince('callee', 'call-1', 0)).toEqual([
      { seq: 1, fromUserId: 'caller', signal: mediaOff },
    ]);
  });

  it('сигнал состояния камеры без булева `video` — 400, как и любая другая неверная форма', async () => {
    const { service } = buildService();

    await expect(
      service.signal('caller', 'call-1', {
        kind: 'media',
        media: { video: 'off' },
      } as unknown as ChatCallSignal),
    ).rejects.toThrow(BadRequestException);
  });

  it('повтор с тем же clientSignalId (партиальный успех) не создаёт второй сигнал (VED-261, feedback-002)', async () => {
    const { service, events } = buildService();

    await service.signal('caller', 'call-1', sdpOffer, 'client-signal-1');
    // Ответ клиенту «потерялся» — тот же POST повторён с тем же ключом.
    await service.signal('caller', 'call-1', sdpOffer, 'client-signal-1');
    await service.signal('caller', 'call-1', sdpOffer, 'client-signal-1');

    // Рассылка (и, следовательно, seq) — ровно один раз.
    expect(events.publish).toHaveBeenCalledTimes(1);
    const signals = await service.signalsSince('callee', 'call-1', 0);
    expect(signals).toEqual([
      { seq: 1, fromUserId: 'caller', signal: sdpOffer },
    ]);
  });

  it('разные clientSignalId — разные сигналы, даже с одинаковым содержимым', async () => {
    const { service } = buildService();

    await service.signal('caller', 'call-1', sdpOffer, 'client-signal-1');
    await service.signal('caller', 'call-1', sdpOffer, 'client-signal-2');

    const signals = await service.signalsSince('callee', 'call-1', 0);
    expect(signals.map((s) => s.seq)).toEqual([1, 2]);
  });

  it('без clientSignalId (старый клиент) поведение не меняется — каждый вызов выдаёт новый seq', async () => {
    const { service } = buildService();

    await service.signal('caller', 'call-1', sdpOffer);
    await service.signal('caller', 'call-1', sdpOffer);

    const signals = await service.signalsSince('callee', 'call-1', 0);
    expect(signals.map((s) => s.seq)).toEqual([1, 2]);
  });

  it('одинаковый clientSignalId, но от разных отправителей (caller/callee) — не путается', async () => {
    const { service } = buildService();

    await service.signal('caller', 'call-1', sdpOffer, 'shared-id');
    await service.signal('callee', 'call-1', sdpAnswer, 'shared-id');

    const forCallee = await service.signalsSince('callee', 'call-1', 0);
    const forCaller = await service.signalsSince('caller', 'call-1', 0);
    expect(forCallee).toHaveLength(1);
    expect(forCaller).toHaveLength(1);
  });

  it('signalsSince отдаёт только сигналы получателя строго после `after`, по возрастанию', async () => {
    const { service } = buildService();

    await service.signal('caller', 'call-1', sdpOffer); // → callee, seq 1
    await service.signal('callee', 'call-1', sdpAnswer); // → caller, seq 2
    await service.signal('caller', 'call-1', {
      kind: 'candidate',
      candidate: { candidate: 'ice-1' },
    }); // → callee, seq 3

    const forCallee = await service.signalsSince('callee', 'call-1', 0);
    expect(forCallee.map((s) => s.seq)).toEqual([1, 3]);
    expect(forCallee[0].signal).toEqual(sdpOffer);

    const forCaller = await service.signalsSince('caller', 'call-1', 0);
    expect(forCaller.map((s) => s.seq)).toEqual([2]);

    // after отсекает уже применённое клиентом.
    const onlyNew = await service.signalsSince('callee', 'call-1', 1);
    expect(onlyNew.map((s) => s.seq)).toEqual([3]);
  });

  it('чужому signalsSince недоступен — 404, как и у остальных операций звонка', async () => {
    const { service } = buildService();
    await service.signal('caller', 'call-1', sdpOffer);

    await expect(service.signalsSince('stranger', 'call-1', 0)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('ограничивает очередь 50 сигналами на получателя — старые вытесняются', async () => {
    const { service } = buildService();

    for (let i = 0; i < 55; i += 1) {
      await service.signal('caller', 'call-1', {
        kind: 'candidate',
        candidate: { candidate: `ice-${i}` },
      });
    }

    const signals = await service.signalsSince('callee', 'call-1', 0);
    expect(signals).toHaveLength(50);
    expect(signals[0].seq).toBe(6); // первые 5 (seq 1..5) вытеснены
    expect(signals[signals.length - 1].seq).toBe(55);
  });

  it('finish() (через end()) очищает накопленные сигналы звонка', async () => {
    const { service } = buildService();
    await service.signal('caller', 'call-1', sdpOffer);
    expect(await service.signalsSince('callee', 'call-1', 0)).toHaveLength(1);

    await service.end('caller', 'call-1', { reason: 'hangup' });

    expect(await service.signalsSince('callee', 'call-1', 0)).toHaveLength(0);
  });

  it('локальный режим (без Redis): сигналы протухают по TTL, если finish() не вызвался', async () => {
    const service = buildService().service;
    const start = new Date('2026-09-17T10:00:00.000Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(start);

    await service.signal('caller', 'call-1', sdpOffer);
    expect(await service.signalsSince('callee', 'call-1', 0)).toHaveLength(1);

    // Ещё в пределах TTL — сигнал жив.
    jest.spyOn(Date, 'now').mockReturnValue(start + BUSY_TTL_ACTIVE_MS - 1);
    expect(await service.signalsSince('callee', 'call-1', 0)).toHaveLength(1);

    // TTL истёк — следующее локальное обращение (к ЛЮБОМУ звонку) его чистит.
    jest.spyOn(Date, 'now').mockReturnValue(start + BUSY_TTL_ACTIVE_MS + 1);
    expect(await service.signalsSince('callee', 'call-1', 0)).toHaveLength(0);

    // И seq для этого звонка начинается заново, а не продолжает старый счёт.
    await service.signal('caller', 'call-1', sdpOffer);
    const signalsAfterPrune = await service.signalsSince('callee', 'call-1', 0);
    expect(signalsAfterPrune).toEqual([
      { seq: 1, fromUserId: 'caller', signal: sdpOffer },
    ]);

    jest.restoreAllMocks();
  });

  it('signal() в уже завершённом звонке — отказ, сигнал не сохраняется', async () => {
    const { service } = buildService(
      callRow({ status: 'ended', endedAt: new Date() }),
    );

    await expect(
      service.signal('caller', 'call-1', sdpOffer),
    ).rejects.toThrow();
  });
});

/**
 * Прод-баг 2026-09-19: нативный звонок застрял в `RINGING`, и телефон
 * отклонял все звонки как «занято». Клиент гасит соединение по data-пушу
 * `chat.call-ended` — этот контракт сервера фиксируется здесь для каждого
 * финала дозвона: таймаут, отмена звонившим, отказ вызываемого.
 */
describe('ChatCallsService — «звонок снят» уходит на телефоны при любом финале дозвона', () => {
  function endedPushes(bus: { emit: jest.Mock }) {
    return bus.emit.mock.calls
      .filter(([name]) => name === CHAT_CALL_ENDED_EVENT)
      .map(
        ([, event]) =>
          event as { recipientId: string; callId: string; reason: string },
      );
  }

  it('дозвон пережил таймер (active() после рестарта) — missed обеим сторонам', async () => {
    const { service, bus } = buildService(
      callRow({
        status: 'ringing',
        answeredAt: null,
        createdAt: new Date(Date.now() - RING_TIMEOUT_MS - 10_000),
      }),
    );
    await expect(service.active('callee')).resolves.toBeNull();
    expect(endedPushes(bus)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipientId: 'callee',
          callId: 'call-1',
          reason: 'missed',
        }),
        expect.objectContaining({
          recipientId: 'caller',
          callId: 'call-1',
          reason: 'missed',
        }),
      ]),
    );
  });

  it('звонивший отменил через 3 секунды — cancelled вызываемому', async () => {
    const { service, bus } = buildService(
      callRow({
        status: 'ringing',
        answeredAt: null,
        createdAt: new Date(Date.now() - 3_000),
      }),
    );
    await service.end('caller', 'call-1');
    expect(endedPushes(bus)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipientId: 'callee',
          callId: 'call-1',
          reason: 'cancelled',
        }),
      ]),
    );
  });

  it('вызываемый отклонил — declined на все его телефоны', async () => {
    const { service, bus } = buildService(
      callRow({
        status: 'ringing',
        answeredAt: null,
        createdAt: new Date(Date.now() - 3_000),
      }),
    );
    await service.decline('callee', 'call-1');
    expect(endedPushes(bus)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipientId: 'callee',
          callId: 'call-1',
          reason: 'declined',
        }),
      ]),
    );
  });

  it('таймер дозвона (RING_TIMEOUT_MS) — missed вызываемому без участия клиентов', async () => {
    jest.useFakeTimers();
    try {
      const { service, bus, getRow } = buildService(
        callRow({ status: 'ringing', answeredAt: null, createdAt: new Date() }),
      );
      (service as unknown as { armRingTimer(id: string): void }).armRingTimer(
        'call-1',
      );
      await jest.advanceTimersByTimeAsync(RING_TIMEOUT_MS);
      expect(getRow().status).toBe('missed');
      expect(endedPushes(bus)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            recipientId: 'callee',
            callId: 'call-1',
            reason: 'missed',
          }),
        ]),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
