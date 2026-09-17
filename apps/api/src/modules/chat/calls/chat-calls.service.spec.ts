import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { ChatCallSignal } from '@vedamatch/shared';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { ChatConversationsService } from '../chat-conversations.service';
import type { ChatEventsService } from '../chat-events.service';
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
  return { service, events, getRow: () => stored };
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

  it('signal() в уже завершённом звонке — отказ, сигнал не сохраняется', async () => {
    const { service } = buildService(
      callRow({ status: 'ended', endedAt: new Date() }),
    );

    await expect(
      service.signal('caller', 'call-1', sdpOffer),
    ).rejects.toThrow();
  });
});
