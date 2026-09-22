import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { ChatCallSignal } from '@vedamatch/shared';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { ChatConversationsService } from '../../chat-conversations.service';
import type { ChatEventsService } from '../../chat-events.service';
import type { ChatPresenceService } from '../../chat-presence.service';
import { ChatGroupCallsService } from './chat-group-calls.service';
import { GROUP_CALL_NOTIFY_COOLDOWN_MS } from './group-call-notify';
import { GROUP_CALL_PARTICIPANT_TTL_MS } from './group-call-room';

/**
 * Сервис комнаты на маленьком дубле Prisma: правила входа/выхода живут в
 * `group-call-room.ts` и проверены там таблицей случаев, здесь — что сервис
 * их действительно применяет и рассылает то, что должен. Без REDIS_HOST
 * сигналы обязаны работать на памяти процесса, как у звонка один на один.
 */

interface ParticipantRow {
  id: string;
  callId: string;
  userId: string;
  state: 'joined' | 'left';
  joinedAt: Date;
  leftAt: Date | null;
  lastSeenAt: Date;
  muted: boolean;
  video: boolean;
}

interface CallRow {
  id: string;
  conversationId: string;
  startedById: string;
  hostId: string | null;
  kind: 'audio' | 'video';
  status: 'live' | 'ended';
  createdAt: Date;
  endedAt: Date | null;
  endReason: string | null;
  /** Когда комната в последний раз будила беседу уведомлением. */
  notifiedAt: Date | null;
}

function user(id: string) {
  return {
    id,
    name: id,
    spiritualName: null,
    avatarUrl: null,
    lastSeenAt: null,
  };
}

function matches(
  row: Record<string, unknown>,
  where: Record<string, unknown>,
): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    // `OR: [...]` — им сервис забирает право на рассылку уведомления:
    // «не слали ни разу ИЛИ слали давно».
    if (key === 'OR')
      return (value as Record<string, unknown>[]).some((branch) =>
        matches(row, branch),
      );
    if (value !== null && typeof value === 'object' && 'in' in value)
      return (value as { in: unknown[] }).in.includes(row[key]);
    if (value !== null && typeof value === 'object' && 'lt' in value) {
      const actual = row[key];
      if (!(actual instanceof Date)) return false;
      return actual.getTime() < (value as { lt: Date }).lt.getTime();
    }
    return row[key] === value;
  });
}

function buildService(
  options: {
    members?: string[];
    conversationKind?: 'direct' | 'group' | 'channel';
    /** Кто заглушил беседу: уведомление о звонке их будить не должно. */
    mutedMembers?: string[];
    /** Кто смотрит беседу прямо сейчас: плашку они и так видят. */
    viewingMembers?: string[];
  } = {},
) {
  const memberIds = options.members ?? ['a', 'b', 'c', 'd', 'e'];
  const muted = new Set(options.mutedMembers ?? []);
  const viewing = new Set(options.viewingMembers ?? []);
  const calls: CallRow[] = [];
  const participants: ParticipantRow[] = [];
  let seq = 0;

  const withIncludes = (row: CallRow) => ({
    ...row,
    startedBy: user(row.startedById),
    participants: participants
      .filter((p) => p.callId === row.id)
      .map((p) => ({ ...p, user: user(p.userId) })),
  });

  const prisma = {
    chatGroupCall: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        seq += 1;
        const row: CallRow = {
          id: `room-${seq}`,
          conversationId: data.conversationId as string,
          startedById: data.startedById as string,
          hostId: (data.hostId as string) ?? null,
          kind: 'audio',
          status: 'live',
          createdAt: new Date(),
          endedAt: null,
          endReason: null,
          notifiedAt: null,
        };
        calls.push(row);
        const created = (
          data.participants as { create: { userId: string } } | undefined
        )?.create;
        if (created)
          participants.push({
            id: `p-${participants.length + 1}`,
            callId: row.id,
            userId: created.userId,
            state: 'joined',
            joinedAt: new Date(),
            leftAt: null,
            lastSeenAt: new Date(),
            muted: false,
            video: false,
          });
        return Promise.resolve(withIncludes(row));
      }),
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        const found = calls.filter((row) =>
          matches(row as unknown as Record<string, unknown>, {
            conversationId: where.conversationId,
            status: where.status,
          }),
        );
        const byParticipant = where.participants
          ? found.filter((row) =>
              participants.some(
                (p) =>
                  p.callId === row.id &&
                  p.state === 'joined' &&
                  p.userId ===
                    (where.participants as { some: { userId: string } }).some
                      .userId,
              ),
            )
          : found;
        const last = byParticipant[byParticipant.length - 1];
        return Promise.resolve(last ? withIncludes(last) : null);
      }),
      findMany: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          calls
            .filter((row) => row.status === where.status)
            .map((row) => withIncludes(row)),
        ),
      ),
      findUnique: jest.fn(({ where }: { where: { id: string } }) => {
        const row = calls.find((c) => c.id === where.id);
        return Promise.resolve(row ? withIncludes(row) : null);
      }),
      findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) => {
        const row = calls.find((c) => c.id === where.id);
        if (!row) throw new Error('нет такой комнаты');
        return Promise.resolve(withIncludes(row));
      }),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<CallRow>;
        }) => {
          const row = calls.find((c) => c.id === where.id)!;
          Object.assign(row, data);
          return Promise.resolve(withIncludes(row));
        },
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Partial<CallRow>;
        }) => {
          const rows = calls.filter((c) =>
            matches(c as unknown as Record<string, unknown>, where),
          );
          rows.forEach((row) => Object.assign(row, data));
          return Promise.resolve({ count: rows.length });
        },
      ),
    },
    chatGroupCallParticipant: {
      upsert: jest.fn(
        ({
          where,
          create,
          update,
        }: {
          where: { callId_userId: { callId: string; userId: string } };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const { callId, userId } = where.callId_userId;
          const found = participants.find(
            (p) => p.callId === callId && p.userId === userId,
          );
          if (found) Object.assign(found, update);
          else
            participants.push({
              id: `p-${participants.length + 1}`,
              callId,
              userId,
              state: 'joined',
              joinedAt: (create.joinedAt as Date) ?? new Date(),
              leftAt: null,
              lastSeenAt: (create.lastSeenAt as Date) ?? new Date(),
              muted: false,
              video: false,
            });
          return Promise.resolve({});
        },
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Partial<ParticipantRow>;
        }) => {
          const rows = participants.filter((p) =>
            matches(p as unknown as Record<string, unknown>, where),
          );
          rows.forEach((row) => Object.assign(row, data));
          return Promise.resolve({ count: rows.length });
        },
      ),
    },
    chatConversation: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          title: 'Вайшнавы Москвы',
          members: memberIds.map((userId) => ({
            userId,
            leftAt: null,
            mutedUntil: muted.has(userId)
              ? new Date(Date.now() + 60 * 60_000)
              : null,
          })),
        }),
      ),
    },
    user: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({ name: where.id, spiritualName: null }),
      ),
    },
    chatMember: {
      findFirst: jest.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(memberIds.includes(where.userId) ? { id: 'm' } : null),
      ),
    },
    chatSettings: {
      findUnique: jest.fn(() => Promise.resolve({ callsEnabled: true })),
    },
  } as unknown as PrismaService;

  const conversations = {
    requireConversation: jest.fn((conversationId: string) =>
      Promise.resolve({
        id: conversationId,
        kind: options.conversationKind ?? 'group',
        state: 'active',
        requestedById: null,
        members: memberIds.map((userId) => ({
          userId,
          role: 'member',
          leftAt: null,
        })),
      }),
    ),
  } as unknown as ChatConversationsService;

  const events = { publish: jest.fn() };
  const config = { get: () => undefined } as unknown as ConfigService;
  const presence = {
    isViewing: jest.fn((userId: string) =>
      Promise.resolve(viewing.has(userId)),
    ),
  };
  const bus = { emit: jest.fn() };

  const service = new ChatGroupCallsService(
    prisma,
    conversations,
    events as unknown as ChatEventsService,
    config,
    presence as unknown as ChatPresenceService,
    bus as unknown as EventEmitter2,
  );
  return { service, events, participants, calls, bus, presence };
}

/** Кому ушло уведомление «идёт звонок» — по порядку вызовов шины. */
function notified(bus: { emit: jest.Mock }): string[] {
  return bus.emit.mock.calls
    .filter(([name]) => name === 'chat.group-call-started')
    .map(([, event]) => (event as { recipientId: string }).recipientId);
}

const offer: ChatCallSignal = {
  kind: 'sdp',
  sdp: { type: 'offer', sdp: 'v=0…' },
};

describe('начало звонка', () => {
  it('открывает комнату и сообщает о ней всей беседе', async () => {
    const { service, events } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });

    expect(room.participants.map((p) => p.user.id)).toEqual(['a']);
    expect(room.hostId).toBe('a');
    expect(room.maxParticipants).toBe(4);
    expect(events.publish).toHaveBeenCalledWith(
      ['a', 'b', 'c', 'd', 'e'],
      expect.objectContaining({ type: 'group-call.started' }),
    );
  });

  it('второй «начать» в той же беседе — вход в ту же комнату, а не вторая', async () => {
    const { service } = buildService();
    const first = await service.start('a', { conversationId: 'conv-1' });
    const second = await service.start('b', { conversationId: 'conv-1' });

    expect(second.id).toBe(first.id);
    expect(second.participants.map((p) => p.user.id)).toEqual(['a', 'b']);
  });

  it('в личном диалоге отказывает — там обычный звонок', async () => {
    const { service } = buildService({ conversationKind: 'direct' });
    await expect(
      service.start('a', { conversationId: 'conv-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('видео на этом этапе не принимает', async () => {
    const { service } = buildService();
    await expect(
      service.start('a', { conversationId: 'conv-1', kind: 'video' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('потолок в четыре человека', () => {
  it('пятого не пускает', async () => {
    const { service } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    for (const id of ['b', 'c', 'd']) await service.join(id, room.id);

    await expect(service.join('e', room.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('после выхода одного место освобождается', async () => {
    const { service } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    for (const id of ['b', 'c', 'd']) await service.join(id, room.id);
    await service.leave('b', room.id);

    const after = await service.join('e', room.id);
    expect(after.participants.map((p) => p.user.id)).toEqual([
      'a',
      'c',
      'd',
      'e',
    ]);
  });
});

describe('выход и хозяин', () => {
  it('хозяин вышел — роль переходит следующему, комната жива', async () => {
    const { service, events } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    await service.join('b', room.id);
    await service.join('c', room.id);

    const after = await service.leave('a', room.id);
    expect(after.status).toBe('live');
    expect(after.hostId).toBe('b');
    expect(after.participants.find((p) => p.user.id === 'b')?.host).toBe(true);
    expect(events.publish).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ type: 'group-call.updated' }),
    );
  });

  it('вышел последний — комната закрывается', async () => {
    const { service, events } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    const after = await service.leave('a', room.id);

    expect(after.status).toBe('ended');
    expect(after.hostId).toBeNull();
    expect(after.participants).toEqual([]);
    expect(events.publish).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ type: 'group-call.ended' }),
    );
  });

  it('вернувшийся не становится хозяином вперёд тех, кто сидел всё это время', async () => {
    const { service, participants } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    await service.join('b', room.id);
    await service.leave('a', room.id);

    // Без сдвига часов все три действия ложатся в одну миллисекунду, и
    // порядок решает разводка по id — в жизни между выходом и возвратом
    // проходят секунды, и проверять надо именно это.
    jest.useFakeTimers().setSystemTime(Date.now() + 5_000);
    try {
      const back = await service.join('a', room.id);
      expect(back.hostId).toBe('b');
      expect(participants.find((p) => p.userId === 'a')!.state).toBe('joined');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('потеря участника', () => {
  it('протухший heartbeat убирает человека из комнаты', async () => {
    const { service, participants } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    await service.join('b', room.id);

    const lost = participants.find((p) => p.userId === 'b')!;
    lost.lastSeenAt = new Date(
      Date.now() - GROUP_CALL_PARTICIPANT_TTL_MS - 1000,
    );

    const after = await service.heartbeat('a', room.id);
    expect(after.participants.map((p) => p.user.id)).toEqual(['a']);
    expect(after.status).toBe('live');
    expect(lost.state).toBe('left');
  });

  it('пропали все — комната закрывается по таймауту', async () => {
    const { service, participants, calls } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    participants.forEach((p) => {
      p.lastSeenAt = new Date(
        Date.now() - GROUP_CALL_PARTICIPANT_TTL_MS - 1000,
      );
    });

    const active = await service.activeForConversation('b', 'conv-1');
    expect(active).toBeNull();
    expect(calls.find((c) => c.id === room.id)!.endReason).toBe('timeout');
  });
});

describe('микрофон', () => {
  it('своё «выключил микрофон» видят остальные', async () => {
    const { service } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    await service.join('b', room.id);

    const after = await service.setState('b', room.id, { muted: true });
    expect(after.participants.find((p) => p.user.id === 'b')?.muted).toBe(true);
    expect(after.participants.find((p) => p.user.id === 'a')?.muted).toBe(
      false,
    );
  });

  it('не участник микрофоном комнаты не управляет', async () => {
    const { service } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    await expect(
      service.setState('b', room.id, { muted: true }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('камера не включается заодно с микрофоном', async () => {
    // Запрос меняет только то, что в нём пришло: иначе кнопка микрофона
    // гасила бы камеру, а кнопка камеры — включала микрофон.
    const { service } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    await service.setState('a', room.id, { video: true });

    const after = await service.setState('a', room.id, { muted: true });
    const self = after.participants.find((p) => p.user.id === 'a')!;
    expect(self.muted).toBe(true);
    expect(self.video).toBe(true);
  });
});

describe('камера', () => {
  /** Комната, где `count` человек уже включили камеру. */
  async function roomWithCameras(count: number) {
    const built = buildService();
    const room = await built.service.start('a', { conversationId: 'conv-1' });
    for (const userId of ['b', 'c', 'd'])
      await built.service.join(userId, room.id);
    for (const userId of ['a', 'b', 'c', 'd'].slice(0, count))
      await built.service.setState(userId, room.id, { video: true });
    return { ...built, room };
  }

  it('трое включают камеры и это видно остальным', async () => {
    const { service, room } = await roomWithCameras(3);
    const state = await service.heartbeat('d', room.id);
    expect(
      state.participants.filter((p) => p.video).map((p) => p.user.id),
    ).toEqual(['a', 'b', 'c']);
  });

  it('четвёртый получает отказ с понятным текстом, а не молчание', async () => {
    const { service, room } = await roomWithCameras(3);
    await expect(
      service.setState('d', room.id, { video: true }),
    ).rejects.toThrow(/В групповом видео могут участвовать трое/);
  });

  it('четвёртый остаётся в звонке голосом', async () => {
    const { service, room } = await roomWithCameras(3);
    await service
      .setState('d', room.id, { video: true })
      .catch(() => undefined);
    const state = await service.heartbeat('d', room.id);
    expect(state.participants.map((p) => p.user.id)).toContain('d');
    expect(state.participants.find((p) => p.user.id === 'd')!.video).toBe(
      false,
    );
  });

  it('место освобождается выключением камеры', async () => {
    const { service, room } = await roomWithCameras(3);
    await service.setState('c', room.id, { video: false });
    const after = await service.setState('d', room.id, { video: true });
    expect(after.participants.find((p) => p.user.id === 'd')!.video).toBe(true);
  });

  it('выход из звонка освобождает место под видео', async () => {
    const { service, room } = await roomWithCameras(3);
    await service.leave('c', room.id);
    const after = await service.setState('d', room.id, { video: true });
    expect(after.participants.find((p) => p.user.id === 'd')!.video).toBe(true);
  });

  it('выход гасит камеру в самой строке, а не только в выдаче', async () => {
    // Потолок считается по живым, поэтому вышедший с `video: true` в
    // выдаче всё равно не виден — и ровно поэтому забытый флаг в строке
    // заметить неоткуда, пока он не всплывёт при следующем входе. Значит
    // смотреть надо строку.
    const { service, room, participants } = await roomWithCameras(1);
    await service.leave('a', room.id);
    expect(participants.find((p) => p.userId === 'a')!.video).toBe(false);
  });

  it('вернувшийся не наследует своё прежнее место под видео', async () => {
    // Иначе двое могли бы занять одно место: пока он ходил, его отдали.
    // Строка портится руками намеренно — это ВТОРОЙ рубеж, и проверять
    // его надо отдельно от первого (гашения при выходе), иначе они
    // прикрывают друг друга и сломать можно оба сразу незамеченно.
    const { service, room, participants } = await roomWithCameras(1);
    await service.leave('a', room.id);
    participants.find((p) => p.userId === 'a')!.video = true;

    await service.join('a', room.id);
    expect(
      participants.find((p) => p.userId === 'a' && p.state === 'joined')!.video,
    ).toBe(false);
  });

  it('мёртвый участник место под видео не держит', async () => {
    const { service, room, participants } = await roomWithCameras(3);
    participants
      .filter((p) => p.userId === 'c')
      .forEach((p) => {
        p.lastSeenAt = new Date(
          Date.now() - GROUP_CALL_PARTICIPANT_TTL_MS - 1000,
        );
      });

    const after = await service.setState('d', room.id, { video: true });
    expect(after.participants.find((p) => p.user.id === 'd')!.video).toBe(true);
  });

  it('изменение камеры рассылается всей беседе', async () => {
    const { service, events, room } = await roomWithCameras(0);
    events.publish.mockClear();
    await service.setState('a', room.id, { video: true });
    const sent = events.publish.mock.calls.at(-1) as
      [string[], { type: string }] | undefined;
    expect(sent?.[1]).toMatchObject({ type: 'group-call.updated' });
    expect(sent?.[0]).toEqual(expect.arrayContaining(['a', 'b', 'c', 'd']));
  });

  it('потолок камер сообщается клиенту числом, а не подразумевается', async () => {
    const { service, room } = await roomWithCameras(0);
    const state = await service.heartbeat('a', room.id);
    expect(state.maxVideoParticipants).toBe(3);
    expect(state.maxVideoParticipants).toBeLessThan(state.maxParticipants);
  });

  it('в закрытой комнате камера не включается', async () => {
    const { service } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    await service.leave('a', room.id);
    await expect(
      service.setState('a', room.id, { video: true }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('сигналинг', () => {
  it('адресует сигнал конкретному участнику и отдаёт его в дочитывании', async () => {
    const { service, events } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    await service.join('b', room.id);
    await service.join('c', room.id);

    await service.signal('c', room.id, 'a', offer, 'sig-1');

    expect(events.publish).toHaveBeenLastCalledWith(
      ['a'],
      expect.objectContaining({
        type: 'group-call.signal',
        fromUserId: 'c',
        seq: 1,
      }),
    );
    await expect(service.signalsSince('a', room.id, 0)).resolves.toEqual([
      { seq: 1, fromUserId: 'c', signal: offer },
    ]);
    await expect(service.signalsSince('b', room.id, 0)).resolves.toEqual([]);
  });

  it('повтор с тем же ключом не порождает второй сигнал', async () => {
    const { service } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    await service.join('b', room.id);

    await service.signal('b', room.id, 'a', offer, 'sig-1');
    await service.signal('b', room.id, 'a', offer, 'sig-1');

    await expect(service.signalsSince('a', room.id, 0)).resolves.toHaveLength(
      1,
    );
  });

  it('вышедшему адресату не шлёт', async () => {
    const { service } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    await service.join('b', room.id);
    await service.leave('b', room.id);

    await expect(
      service.signal('a', room.id, 'b', offer),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('сам себе сигналить нельзя и мусор не принимается', async () => {
    const { service } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    await expect(
      service.signal('a', room.id, 'a', offer),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.signal('a', room.id, 'b', {
        kind: 'nonsense',
      } as unknown as ChatCallSignal),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('чужого в беседу не пускает вовсе', async () => {
    const { service } = buildService({ members: ['a', 'b'] });
    const room = await service.start('a', { conversationId: 'conv-1' });
    await expect(service.join('z', room.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('восстановление после перезапуска', () => {
  it('отдаёт комнату, в которой человек сейчас', async () => {
    const { service } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    await service.join('b', room.id);

    await expect(service.activeForUser('b')).resolves.toMatchObject({
      id: room.id,
    });
    await service.leave('b', room.id);
    await expect(service.activeForUser('b')).resolves.toBeNull();
  });
});

/**
 * Оповещение о звонке (VED-293, этап 3). Плашка внутри беседы видна только
 * тому, кто в беседу смотрит; всех остальных зовёт уведомление. Проверяем
 * не формулировку (она в `notification-copy.ts`), а кого именно сервис
 * будит и как часто он имеет на это право.
 */
describe('оповещение о групповом звонке', () => {
  it('зовёт всю беседу, кроме того, кто начал', async () => {
    const { service, bus } = buildService();
    await service.start('a', { conversationId: 'conv-1' });

    expect(notified(bus)).toEqual(['b', 'c', 'd', 'e']);
  });

  it('шлёт своё имя события, а не входящий вызов', async () => {
    const { service, bus } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });

    // `chat.call-incoming` поднял бы нативный экран вызова на один callId —
    // трое в беседе дали бы три звонка на телефон.
    expect(bus.emit).not.toHaveBeenCalledWith(
      'chat.call-incoming',
      expect.anything(),
    );
    expect(bus.emit).toHaveBeenCalledWith('chat.group-call-started', {
      name: 'chat.group-call-started',
      recipientId: 'b',
      conversationTitle: 'Вайшнавы Москвы',
      conversationId: 'conv-1',
      callId: room.id,
      starterName: 'a',
    });
  });

  it('не будит того, кто заглушил беседу', async () => {
    const { service, bus } = buildService({ mutedMembers: ['c'] });
    await service.start('a', { conversationId: 'conv-1' });

    expect(notified(bus)).toEqual(['b', 'd', 'e']);
  });

  it('не будит того, кто смотрит беседу: плашка у него уже на экране', async () => {
    const { service, bus } = buildService({ viewingMembers: ['d'] });
    await service.start('a', { conversationId: 'conv-1' });

    expect(notified(bus)).toEqual(['b', 'c', 'e']);
  });

  it('каждый следующий вход не рассылает новую волну', async () => {
    const { service, bus } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    bus.emit.mockClear();

    await service.join('b', room.id);
    await service.join('c', room.id);

    expect(notified(bus)).toEqual([]);
  });

  it('спустя окно тишины разговор напоминает о себе не пришедшим', async () => {
    const { service, bus, calls } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    await service.join('b', room.id);
    bus.emit.mockClear();

    // Комната идёт давно: прошлая волна уже за пределами окна.
    calls[0].notifiedAt = new Date(
      Date.now() - GROUP_CALL_NOTIFY_COOLDOWN_MS - 1000,
    );
    await service.join('c', room.id);

    // Тех, кто уже в комнате, напоминание не трогает.
    expect(notified(bus)).toEqual(['d', 'e']);
  });

  it('не будит того, кто только что вышел из комнаты', async () => {
    const { service, bus, calls } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    await service.join('b', room.id);
    await service.leave('b', room.id);
    bus.emit.mockClear();

    calls[0].notifiedAt = new Date(
      Date.now() - GROUP_CALL_NOTIFY_COOLDOWN_MS - 1000,
    );
    await service.join('c', room.id);

    expect(notified(bus)).not.toContain('b');
  });

  it('повторный вход с другого экрана беседу не будит', async () => {
    const { service, bus, calls } = buildService();
    const room = await service.start('a', { conversationId: 'conv-1' });
    bus.emit.mockClear();
    calls[0].notifiedAt = new Date(
      Date.now() - GROUP_CALL_NOTIFY_COOLDOWN_MS - 1000,
    );

    await service.join('a', room.id);

    expect(notified(bus)).toEqual([]);
  });

  it('несостоявшееся уведомление не роняет звонок', async () => {
    const { service, bus } = buildService();
    bus.emit.mockImplementation(() => {
      throw new Error('шина отвалилась');
    });

    await expect(
      service.start('a', { conversationId: 'conv-1' }),
    ).resolves.toMatchObject({ status: 'live' });
  });
});
