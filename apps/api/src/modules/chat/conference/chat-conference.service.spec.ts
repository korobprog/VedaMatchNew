import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../../prisma/prisma.service';
import { ChatConferenceService } from './chat-conference.service';
import { CONFERENCE_MAX_PARTICIPANTS } from './conference-link';

/**
 * Сервис конференции на маленьком дубле Prisma — тем же приёмом, что и
 * `chat-group-calls.service.spec.ts` рядом. Правила «кого пускать» живут в
 * `conference-link.ts` и проверены там таблицей случаев; здесь — что сервис
 * их действительно применяет, что беседа заводится той самой (закрытая
 * группа с владельцем), и что ссылка наружу отдаёт ровно то, что можно.
 */

interface LinkRow {
  id: string;
  conversationId: string;
  token: string;
  createdById: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

interface MemberRow {
  conversationId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  leftAt: Date | null;
}

interface ConversationRow {
  id: string;
  kind: string;
  state: string;
  visibility: string;
  title: string | null;
  createdById: string;
}

const HOUR = 60 * 60 * 1000;

function buildService(
  options: {
    blocks?: [string, string][];
    liveCall?: boolean;
    /**
     * Кто успел войти между чтением комнаты и транзакцией. Так
     * воспроизводится гонка двух «пятых»: оба прочитали свободное место,
     * оба пошли занимать.
     */
    slipsIn?: string | null;
  } = {},
) {
  const conversations: ConversationRow[] = [];
  const members: MemberRow[] = [];
  const links: LinkRow[] = [];
  const blocks = options.blocks ?? [];
  let seq = 0;

  const user = (id: string) => ({
    id,
    name: `Имя ${id}`,
    spiritualName: null,
    avatarUrl: null,
    lastSeenAt: null,
  });

  const liveMembers = (conversationId: string) =>
    members.filter((m) => m.conversationId === conversationId && !m.leftAt);

  const withIncludes = (link: LinkRow) => {
    const conversation = conversations.find(
      (c) => c.id === link.conversationId,
    )!;
    return {
      ...link,
      createdBy: user(link.createdById),
      conversation: {
        ...conversation,
        members: liveMembers(link.conversationId).map((m) => ({
          ...m,
          user: user(m.userId),
        })),
        groupCalls: options.liveCall ? [{ id: 'call-1' }] : [],
      },
    };
  };

  const memberStore = {
    count: jest.fn(
      ({ where }: { where: { conversationId: string } }) =>
        liveMembers(where.conversationId).length,
    ),
    upsert: jest.fn(
      ({
        where,
        update,
        create,
      }: {
        where: {
          conversationId_userId: { conversationId: string; userId: string };
        };
        update: { leftAt: Date | null };
        create: { conversationId: string; userId: string };
      }) => {
        const { conversationId, userId } = where.conversationId_userId;
        const existing = members.find(
          (m) => m.conversationId === conversationId && m.userId === userId,
        );
        if (existing) existing.leftAt = update.leftAt;
        else
          members.push({
            conversationId: create.conversationId,
            userId: create.userId,
            role: 'member',
            leftAt: null,
          });
        return {};
      },
    ),
  };

  const prisma = {
    user: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        where.id === 'ghost' ? null : user(where.id),
      ),
    },
    chatConversation: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        seq += 1;
        const row: ConversationRow = {
          id: `conv-${seq}`,
          kind: data.kind as string,
          state: data.state as string,
          visibility: data.visibility as string,
          title: (data.title as string) ?? null,
          createdById: data.createdById as string,
        };
        conversations.push(row);
        for (const created of (data.members as { create: MemberRow[] }).create)
          members.push({
            conversationId: row.id,
            userId: created.userId,
            role: created.role ?? 'member',
            leftAt: null,
          });
        return { id: row.id };
      }),
    },
    chatConferenceLink: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row: LinkRow = {
          id: `link-${links.length + 1}`,
          conversationId: data.conversationId as string,
          token: data.token as string,
          createdById: data.createdById as string,
          expiresAt: data.expiresAt as Date,
          revokedAt: null,
        };
        if (links.some((l) => l.token === row.token))
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        links.push(row);
        return withIncludes(row);
      }),
      findUnique: jest.fn(
        ({ where }: { where: { token?: string; conversationId?: string } }) => {
          const row = links.find((l) =>
            where.token
              ? l.token === where.token
              : l.conversationId === where.conversationId,
          );
          return row ? withIncludes(row) : null;
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<LinkRow>;
        }) => {
          const row = links.find((l) => l.id === where.id)!;
          Object.assign(row, data);
          return withIncludes(row);
        },
      ),
    },
    chatMember: memberStore,
    userBlock: {
      findFirst: jest.fn(
        ({
          where,
        }: {
          where: { OR: { blockerId: string; blockedId: string }[] };
        }) =>
          where.OR.some(({ blockerId, blockedId }) =>
            blocks.some(([a, b]) => a === blockerId && b === blockedId),
          )
            ? { id: 'block-1' }
            : null,
      ),
    },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => {
      // Конкурент занимает место ровно между проверкой и транзакцией —
      // единственный момент, в котором пересчёт внутри транзакции и нужен.
      if (options.slipsIn && liveMembers(conversations[0].id).length === 3) {
        members.push({
          conversationId: conversations[0].id,
          userId: options.slipsIn,
          role: 'member',
          leftAt: null,
        });
        options.slipsIn = null;
      }
      return callback({ chatMember: memberStore });
    }),
  };

  const config = {
    get: (key: string) =>
      key === 'WEB_ORIGIN'
        ? 'https://vedamatch.ru,https://vedamatch.com'
        : undefined,
  };

  const service = new ChatConferenceService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
  );
  return { service, prisma, conversations, members, links };
}

describe('создание конференции', () => {
  it('заводит закрытую группу, где создатель — владелец', async () => {
    const { service, conversations, members } = buildService();
    const room = await service.create('u1');

    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      kind: 'group',
      state: 'active',
      visibility: 'private',
      createdById: 'u1',
    });
    expect(members).toEqual([
      {
        conversationId: room.conversationId,
        userId: 'u1',
        role: 'owner',
        leftAt: null,
      },
    ]);
  });

  it('отдаёт ссылку на публичном домене портала, а не на втором из списка', async () => {
    const { service } = buildService();
    const room = await service.create('u1');
    expect(room.url).toMatch(/^https:\/\/vedamatch\.ru\/j\/[A-Za-z0-9_-]{32}$/);
  });

  it('название по умолчанию собирается из имени хозяина', async () => {
    const { service } = buildService();
    expect((await service.create('u1')).title).toBe('Конференция · Имя u1');
  });

  it('своё название доходит до беседы', async () => {
    const { service, conversations } = buildService();
    await service.create('u1', { title: 'Разбор Гиты' });
    expect(conversations[0].title).toBe('Разбор Гиты');
  });

  it('срок ссылки — полсуток вперёд', async () => {
    const { service } = buildService();
    const before = Date.now();
    const room = await service.create('u1');
    const expires = new Date(room.expiresAt).getTime();
    expect(expires - before).toBeGreaterThanOrEqual(12 * HOUR - 5_000);
    expect(expires - before).toBeLessThanOrEqual(12 * HOUR + 5_000);
  });

  it('новая ссылка ещё никем не занята и открыта', async () => {
    const { service } = buildService();
    const room = await service.create('u1');
    expect(room).toMatchObject({
      state: 'active',
      revokedAt: null,
      seatsTaken: 1,
      maxParticipants: CONFERENCE_MAX_PARTICIPANTS,
      callLive: false,
    });
  });

  it('две конференции подряд — две разные комнаты и две разные ссылки', async () => {
    const { service } = buildService();
    const first = await service.create('u1');
    const second = await service.create('u1');
    expect(first.conversationId).not.toBe(second.conversationId);
    expect(first.url).not.toBe(second.url);
  });

  it('без профиля конференцию не завести', async () => {
    const { service } = buildService();
    await expect(service.create('ghost')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('карточка приглашения', () => {
  const tokenOf = (url: string) => url.split('/').pop()!;

  it('гость видит, кто зовёт и сколько мест', async () => {
    const { service } = buildService();
    const room = await service.create('u1');
    const invite = await service.invite(tokenOf(room.url), null);

    expect(invite).toMatchObject({
      title: 'Конференция · Имя u1',
      state: 'active',
      seatsTaken: 1,
      maxParticipants: CONFERENCE_MAX_PARTICIPANTS,
      alreadyMember: false,
      denial: null,
    });
    expect(invite.host.id).toBe('u1');
  });

  // Наружу уходит ровно то, что нужно решить «идти или нет». Список
  // участников, переписка и id беседы сюда не попадают: карточку читает
  // кто угодно, у кого оказалась ссылка.
  it('не отдаёт ни состава, ни id беседы', async () => {
    const { service } = buildService();
    const room = await service.create('u1');
    const invite = await service.invite(tokenOf(room.url), null);
    const keys = Object.keys(invite).sort();
    expect(keys).toEqual(
      [
        'alreadyMember',
        'callLive',
        'denial',
        'expiresAt',
        'host',
        'maxParticipants',
        'seatsTaken',
        'state',
        'title',
      ].sort(),
    );
  });

  it('несуществующий токен — «нет такой конференции»', async () => {
    const { service } = buildService();
    await expect(service.invite('x'.repeat(32), null)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('своему говорит «вы уже внутри», а не зовёт заново', async () => {
    const { service } = buildService();
    const room = await service.create('u1');
    const invite = await service.invite(tokenOf(room.url), 'u1');
    expect(invite.alreadyMember).toBe(true);
    expect(invite.denial).toBeNull();
  });

  it('идущий разговор виден до входа', async () => {
    const { service } = buildService({ liveCall: true });
    const room = await service.create('u1');
    expect((await service.invite(tokenOf(room.url), null)).callLive).toBe(true);
  });

  it('о потолке сообщает отказом с числом, а не молчанием', async () => {
    const { service } = buildService();
    const room = await service.create('u1');
    const token = tokenOf(room.url);
    for (const id of ['u2', 'u3', 'u4']) await service.join(token, id);

    const invite = await service.invite(token, 'u5');
    expect(invite.seatsTaken).toBe(CONFERENCE_MAX_PARTICIPANTS);
    expect(invite.denial).toContain('4');
  });
});

describe('вход по ссылке', () => {
  const tokenOf = (url: string) => url.split('/').pop()!;

  it('приглашённый становится участником беседы', async () => {
    const { service, members } = buildService();
    const room = await service.create('u1');
    const joined = await service.join(tokenOf(room.url), 'u2');

    expect(joined.conversationId).toBe(room.conversationId);
    expect(joined.seatsTaken).toBe(2);
    expect(members.map((m) => m.userId)).toEqual(['u1', 'u2']);
  });

  it('вошедший получает обычное членство, а не владение', async () => {
    const { service, members } = buildService();
    const room = await service.create('u1');
    await service.join(tokenOf(room.url), 'u2');
    expect(members.find((m) => m.userId === 'u2')?.role).toBe('member');
  });

  it('повторный переход по ссылке не плодит второго участника', async () => {
    const { service, members } = buildService();
    const room = await service.create('u1');
    const token = tokenOf(room.url);
    await service.join(token, 'u2');
    await service.join(token, 'u2');
    expect(members.filter((m) => m.userId === 'u2')).toHaveLength(1);
  });

  it('хозяин по своей же ссылке просто возвращается', async () => {
    const { service, members } = buildService();
    const room = await service.create('u1');
    await service.join(tokenOf(room.url), 'u1');
    expect(members).toHaveLength(1);
  });

  it('вышедший возвращается той же строкой', async () => {
    const { service, members } = buildService();
    const room = await service.create('u1');
    const token = tokenOf(room.url);
    await service.join(token, 'u2');
    members.find((m) => m.userId === 'u2')!.leftAt = new Date();

    await service.join(token, 'u2');
    expect(members.filter((m) => m.userId === 'u2')).toHaveLength(1);
    expect(members.find((m) => m.userId === 'u2')?.leftAt).toBeNull();
  });

  it('пятого не пускает и называет причину', async () => {
    const { service, members } = buildService();
    const room = await service.create('u1');
    const token = tokenOf(room.url);
    for (const id of ['u2', 'u3', 'u4']) await service.join(token, id);

    await expect(service.join(token, 'u5')).rejects.toThrow(/4/);
    expect(members.map((m) => m.userId)).not.toContain('u5');
  });

  // Место, освободившееся после вышедшего, обязано достаться следующему:
  // иначе комната залипает «полной» до конца дня.
  it('освободившееся место достаётся следующему', async () => {
    const { service, members } = buildService();
    const room = await service.create('u1');
    const token = tokenOf(room.url);
    for (const id of ['u2', 'u3', 'u4']) await service.join(token, id);
    members.find((m) => m.userId === 'u4')!.leftAt = new Date();

    await expect(service.join(token, 'u5')).resolves.toMatchObject({
      seatsTaken: CONFERENCE_MAX_PARTICIPANTS,
    });
  });

  // Гонка двух «пятых»: оба прочитали свободное место. Без пересчёта
  // ВНУТРИ транзакции оба вошли бы, и одного из них выставил бы уже звонок —
  // после «здравствуйте».
  it('занятое между проверкой и записью место не отдаётся дважды', async () => {
    const { service, members } = buildService({ slipsIn: 'u4' });
    const room = await service.create('u1');
    const token = tokenOf(room.url);
    for (const id of ['u2', 'u3']) await service.join(token, id);

    // Сейчас в комнате трое; пятым подходит u5, но место занимает u4.
    await expect(service.join(token, 'u5')).rejects.toThrow(/4/);
    expect(
      members
        .filter((m) => !m.leftAt)
        .map((m) => m.userId)
        .sort(),
    ).toEqual(['u1', 'u2', 'u3', 'u4']);
  });

  it('пересчитывает места внутри транзакции, а не по прочитанному раньше', async () => {
    const { service, prisma } = buildService();
    const room = await service.create('u1');
    await service.join(tokenOf(room.url), 'u2');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.chatMember.count).toHaveBeenCalled();
  });

  it('заблокировавшего хозяина в комнату не ведёт', async () => {
    const { service, members } = buildService({ blocks: [['u2', 'u1']] });
    const room = await service.create('u1');
    await expect(service.join(tokenOf(room.url), 'u2')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(members).toHaveLength(1);
  });

  it('заблокированного хозяином тоже не ведёт', async () => {
    const { service } = buildService({ blocks: [['u1', 'u2']] });
    const room = await service.create('u1');
    await expect(service.join(tokenOf(room.url), 'u2')).rejects.toThrow(
      /недоступна/,
    );
  });
});

describe('срок и отзыв', () => {
  const tokenOf = (url: string) => url.split('/').pop()!;

  it('по истёкшей ссылке не входят', async () => {
    const { service, links } = buildService();
    const room = await service.create('u1');
    links[0].expiresAt = new Date(Date.now() - 1000);

    await expect(service.join(tokenOf(room.url), 'u2')).rejects.toThrow(
      /Срок ссылки истёк/,
    );
    expect((await service.invite(tokenOf(room.url), null)).state).toBe(
      'expired',
    );
  });

  it('отозванная ссылка закрыта для чужих', async () => {
    const { service } = buildService();
    const room = await service.create('u1');
    await service.revoke(room.conversationId, 'u1');

    await expect(service.join(tokenOf(room.url), 'u2')).rejects.toThrow(
      /закрыли/,
    );
  });

  // Главное свойство отзыва: он про чужих. Разговор, который уже идёт,
  // «закрыть вход» ломать не должно.
  it('отзыв не выставляет тех, кто уже внутри', async () => {
    const { service, members } = buildService();
    const room = await service.create('u1');
    const token = tokenOf(room.url);
    await service.join(token, 'u2');
    await service.revoke(room.conversationId, 'u1');

    await expect(service.join(token, 'u2')).resolves.toMatchObject({
      conversationId: room.conversationId,
    });
    expect(members.filter((m) => !m.leftAt)).toHaveLength(2);
  });

  it('отзыв идемпотентен', async () => {
    const { service } = buildService();
    const room = await service.create('u1');
    const first = await service.revoke(room.conversationId, 'u1');
    const second = await service.revoke(room.conversationId, 'u1');
    expect(second.revokedAt).toBe(first.revokedAt);
    expect(second.state).toBe('revoked');
  });

  it('отзывает только хозяин комнаты', async () => {
    const { service } = buildService();
    const room = await service.create('u1');
    await service.join(tokenOf(room.url), 'u2');
    await expect(
      service.revoke(room.conversationId, 'u2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('постороннему комната отвечает «не найдено», а не «нельзя»', async () => {
    const { service } = buildService();
    const room = await service.create('u1');
    await expect(
      service.forConversation(room.conversationId, 'stranger'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('новая ссылка отменяет прежнюю и снимает отзыв', async () => {
    const { service } = buildService();
    const room = await service.create('u1');
    const oldToken = tokenOf(room.url);
    await service.revoke(room.conversationId, 'u1');

    const rotated = await service.rotate(room.conversationId, 'u1');
    expect(rotated.url).not.toBe(room.url);
    expect(rotated.state).toBe('active');
    expect(rotated.revokedAt).toBeNull();
    await expect(service.invite(oldToken, null)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('свою ссылку участник может скопировать ещё раз', async () => {
    const { service } = buildService();
    const room = await service.create('u1');
    await service.join(tokenOf(room.url), 'u2');
    await expect(
      service.forConversation(room.conversationId, 'u2'),
    ).resolves.toMatchObject({ url: room.url });
  });

  // Опоздавший на час после «все разошлись» должен уметь войти и начать
  // разговор заново: комната живёт до срока ссылки, а не до конца звонка.
  it('закончившийся разговор ссылку не закрывает', async () => {
    const { service } = buildService({ liveCall: false });
    const room = await service.create('u1');
    const invite = await service.invite(tokenOf(room.url), null);
    expect(invite.callLive).toBe(false);
    expect(invite.denial).toBeNull();
  });
});
