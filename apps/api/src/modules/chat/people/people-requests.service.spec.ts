import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ModerationService } from '../../moderation/moderation.service';
import { PeopleAvatarService } from './people-avatar.service';
import { PeopleRequestsService } from './people-requests.service';
import { PeopleService } from './people.service';

const now = new Date('2026-08-13T10:00:00.000Z');

type Overrides = Record<string, unknown>;

function party(id: string, overrides: Overrides = {}) {
  return {
    id,
    name: `Имя ${id}`,
    avatarUrl: `https://cdn/${id}.png`,
    avatarKey: null,
    homeLocation: { city: 'Москва', country: 'Россия' },
    contactsProfile: { headline: 'Повар-прасадарий' },
    ...overrides,
  };
}

function request(overrides: Overrides = {}) {
  return {
    id: 'req-1',
    fromUserId: 'viewer',
    toUserId: 'owner',
    message: 'Здравствуйте',
    status: 'pending',
    createdAt: new Date('2026-08-13T09:00:00.000Z'),
    respondedAt: null,
    fromUser: party('viewer'),
    toUser: party('owner'),
    ...overrides,
  };
}

interface UpsertArg {
  where: Record<string, unknown>;
  create: Record<string, unknown>;
  update: Record<string, unknown>;
}

/** Аргумент первого вызова upsert — читаем его, а не сравниваем матчерами. */
function upsertArg(mock: jest.Mock): UpsertArg {
  const calls = mock.mock.calls as [UpsertArg][];
  return calls[0][0];
}

describe('PeopleRequestsService', () => {
  const prisma = {
    contactsProfile: { findUnique: jest.fn() },
    contactsRequest: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    contactsDisclosure: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const contacts = { getCard: jest.fn() };
  const moderation = { hideFrom: jest.fn(), isHidden: jest.fn() };
  const users = { resolveAvatarUrl: jest.fn() };
  const events = { emit: jest.fn() };
  const service = new PeopleRequestsService(
    prisma as unknown as PrismaService,
    contacts as unknown as PeopleService,
    moderation as unknown as ModerationService,
    users as unknown as PeopleAvatarService,
    events as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    // Карточка получателя по умолчанию видна и без ограничения на обращения.
    contacts.getCard.mockResolvedValue({ userId: 'owner' });
    prisma.contactsProfile.findUnique.mockResolvedValue({
      requestsFromVerifiedOnly: false,
    });
    prisma.contactsRequest.findUnique.mockResolvedValue(null);
    prisma.contactsRequest.findMany.mockResolvedValue([]);
    moderation.isHidden.mockResolvedValue(false);
    prisma.contactsRequest.count.mockResolvedValue(0);
    prisma.contactsRequest.upsert.mockResolvedValue(request());
    prisma.contactsRequest.update.mockResolvedValue(request());
    prisma.contactsDisclosure.findMany.mockResolvedValue([]);
    prisma.contactsDisclosure.upsert.mockResolvedValue({ id: 'disc-1' });
    prisma.user.findUnique.mockResolvedValue({
      // name читается для уведомления, стадии — для requestsFromVerifiedOnly.
      name: 'Кришна',
      spiritualStage: 'practitioner',
      devoteeVerificationStatus: null,
    });
    users.resolveAvatarUrl.mockImplementation((user: { avatarUrl: string }) =>
      Promise.resolve(user.avatarUrl),
    );
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn(prisma)),
    );
  });

  describe('create', () => {
    it('нельзя отправить запрос самому себе', async () => {
      await expect(
        service.create('viewer', { toUserId: 'viewer' }, now),
      ).rejects.toThrow('Нельзя отправить запрос самому себе');
      expect(contacts.getCard).not.toHaveBeenCalled();
    });

    it('404, когда карточка получателя не видна отправителю', async () => {
      // Проверка видимости не дублируется: она целиком в getCard, и её отказ
      // (404) проходит наружу как есть — иначе запрос стал бы детектором
      // «этот человек меня скрыл».
      contacts.getCard.mockRejectedValue(
        new NotFoundException('Карточка не найдена'),
      );

      await expect(
        service.create('viewer', { toUserId: 'owner' }, now),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.contactsRequest.upsert).not.toHaveBeenCalled();
    });

    it('403 при requestsFromVerifiedOnly и неподтверждённом отправителе', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue({
        requestsFromVerifiedOnly: true,
      });

      const error = await service
        .create('viewer', { toUserId: 'owner' }, now)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).message).toContain(
        'только от подтверждённых преданных',
      );
    });

    it('пропускает подтверждённого преданного при requestsFromVerifiedOnly', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue({
        requestsFromVerifiedOnly: true,
      });
      prisma.user.findUnique.mockResolvedValue({
        spiritualStage: 'devotee',
        devoteeVerificationStatus: 'confirmed',
      });

      await service.create('viewer', { toUserId: 'owner' }, now);

      expect(prisma.contactsRequest.upsert).toHaveBeenCalled();
    });

    it('обрезает сообщение и превращает пустое в null', async () => {
      await service.create(
        'viewer',
        { toUserId: 'owner', message: '   ' },
        now,
      );

      expect(upsertArg(prisma.contactsRequest.upsert).create).toEqual(
        expect.objectContaining({ message: null }),
      );
    });

    it('уведомляет получателя о новом запросе', async () => {
      // Без события запрос лежит молча, пока получатель сам не зайдёт
      // в раздел, — а весь сценарий держится на том, что он его увидел.
      await service.create('viewer', { toUserId: 'owner' }, now);

      expect(events.emit).toHaveBeenCalledWith('contacts.request.received', {
        name: 'contacts.request.received',
        recipientId: 'owner',
        senderName: 'Кришна',
      });
    });

    it('отклоняет сообщение длиннее 500 символов', async () => {
      await expect(
        service.create(
          'viewer',
          { toUserId: 'owner', message: 'я'.repeat(501) },
          now,
        ),
      ).rejects.toThrow('Сообщение: не длиннее 500 символов');
    });

    it('повторный запрос при pending — «Запрос уже отправлен»', async () => {
      prisma.contactsRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'pending',
      });

      await expect(
        service.create('viewer', { toUserId: 'owner' }, now),
      ).rejects.toThrow('Запрос уже отправлен');
      expect(prisma.contactsRequest.upsert).not.toHaveBeenCalled();
    });

    it('повторный запрос при accepted — «Контакты уже открыты»', async () => {
      prisma.contactsRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'accepted',
      });
      prisma.contactsDisclosure.findFirst.mockResolvedValue({ id: 'disc-1' });

      await expect(
        service.create('viewer', { toUserId: 'owner' }, now),
      ).rejects.toThrow('Контакты уже открыты');
    });

    it('после отзыва доступа можно попросить снова, а не упереться в тупик', async () => {
      // Запрос остаётся accepted навсегда, а раскрытие владелец отозвал.
      // Без этой ветки человек лишался и контактов, и возможности попросить.
      prisma.contactsRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'accepted',
      });
      prisma.contactsDisclosure.findFirst.mockResolvedValue(null);

      await service.create('viewer', { toUserId: 'owner' }, now);

      expect(upsertArg(prisma.contactsRequest.upsert).update).toEqual(
        expect.objectContaining({ status: 'pending' }),
      );
    });

    it('после отказа запрос можно отправить снова: человек мог передумать', async () => {
      prisma.contactsRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'declined',
      });

      await service.create('viewer', { toUserId: 'owner' }, now);

      expect(upsertArg(prisma.contactsRequest.upsert).update).toEqual(
        expect.objectContaining({
          status: 'pending',
          respondedAt: null,
          // createdAt переставляется, иначе лимит суток обходится
          // переоткрытием старой строки.
          createdAt: now,
        }),
      );
    });

    it('после отзыва отправителем запрос тоже можно отправить снова', async () => {
      prisma.contactsRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'cancelled',
      });

      await service.create('viewer', { toUserId: 'owner' }, now);

      expect(prisma.contactsRequest.upsert).toHaveBeenCalled();
    });

    it('не пускает сверх суточного лимита — это анти-скрапинг', async () => {
      prisma.contactsRequest.count.mockResolvedValue(10);

      await expect(
        service.create('viewer', { toUserId: 'owner' }, now),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create('viewer', { toUserId: 'owner' }, now),
      ).rejects.toThrow('Больше 10 запросов контакта в сутки');
      expect(prisma.contactsRequest.upsert).not.toHaveBeenCalled();
    });

    it('считает лимит скользящим окном в 24 часа по отправителю', async () => {
      await service.create('viewer', { toUserId: 'owner' }, now);

      expect(prisma.contactsRequest.count).toHaveBeenCalledWith({
        where: {
          fromUserId: 'viewer',
          createdAt: { gte: new Date('2026-08-12T10:00:00.000Z') },
        },
      });
    });
  });

  describe('list', () => {
    it('разделяет входящие и исходящие и считает остаток на сутки', async () => {
      prisma.contactsRequest.findMany.mockResolvedValue([
        request(),
        request({
          id: 'req-2',
          fromUserId: 'owner',
          toUserId: 'other',
          fromUser: party('owner'),
          toUser: party('other'),
        }),
      ]);
      prisma.contactsRequest.count.mockResolvedValue(3);

      const state = await service.list('owner', now);

      expect(state.incoming.map((r) => r.id)).toEqual(['req-1']);
      expect(state.outgoing.map((r) => r.id)).toEqual(['req-2']);
      expect(state.incoming[0].user.userId).toBe('viewer');
      expect(state.outgoing[0].user.userId).toBe('other');
      expect(state.remainingToday).toBe(7);
    });

    it('остаток не уходит в минус', async () => {
      prisma.contactsRequest.count.mockResolvedValue(14);

      await expect(service.list('viewer', now)).resolves.toEqual(
        expect.objectContaining({ remainingToday: 0 }),
      );
    });

    it('контакты в списке — только при действующем раскрытии', async () => {
      prisma.contactsRequest.findMany.mockResolvedValue([request()]);
      prisma.contactsDisclosure.findMany.mockResolvedValue([
        {
          owner: {
            id: 'owner',
            socialLinks: { telegram: '@radha' },
            messengers: { phone: '+7000' },
          },
        },
      ]);

      const state = await service.list('viewer', now);

      expect(state.outgoing[0].contacts).toEqual({
        socialLinks: { telegram: '@radha' },
        messengers: { phone: '+7000' },
      });
      expect(prisma.contactsDisclosure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { viewerId: 'viewer', revokedAt: null },
        }),
      );
    });

    it('без раскрытия контакты в списке остаются null', async () => {
      prisma.contactsRequest.findMany.mockResolvedValue([request()]);

      const state = await service.list('viewer', now);

      expect(state.outgoing[0].contacts).toBeNull();
    });
  });

  describe('respond', () => {
    it('нельзя отвечать на чужой запрос', async () => {
      prisma.contactsRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        fromUserId: 'viewer',
        toUserId: 'owner',
        status: 'pending',
      });

      await expect(
        service.respond('stranger', 'req-1', { accept: true }, now),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.contactsRequest.update).not.toHaveBeenCalled();
    });

    it('нельзя отвечать на уже рассмотренный запрос', async () => {
      prisma.contactsRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        fromUserId: 'viewer',
        toUserId: 'owner',
        status: 'declined',
      });

      await expect(
        service.respond('owner', 'req-1', { accept: true }, now),
      ).rejects.toThrow('На этот запрос уже отвечено');
    });

    describe('когда запрос ждёт ответа', () => {
      beforeEach(() => {
        prisma.contactsRequest.findUnique.mockResolvedValue({
          id: 'req-1',
          fromUserId: 'viewer',
          toUserId: 'owner',
          status: 'pending',
        });
      });

      it('согласие переводит запрос в accepted и создаёт раскрытие', async () => {
        await service.respond('owner', 'req-1', { accept: true }, now);

        expect(prisma.contactsRequest.update).toHaveBeenCalledWith({
          where: { id: 'req-1' },
          data: { status: 'accepted', respondedAt: now },
        });
        const arg = upsertArg(prisma.contactsDisclosure.upsert);
        expect(arg.where).toEqual({
          ownerId_viewerId: { ownerId: 'owner', viewerId: 'viewer' },
        });
        expect(arg.create).toEqual(
          expect.objectContaining({
            ownerId: 'owner',
            viewerId: 'viewer',
            requestId: 'req-1',
          }),
        );
      });

      it('уведомляет отправителя, что контакты открыты', async () => {
        await service.respond('owner', 'req-1', { accept: true }, now);

        expect(events.emit).toHaveBeenCalledWith('contacts.request.accepted', {
          name: 'contacts.request.accepted',
          recipientId: 'viewer',
          senderName: 'Кришна',
          ownerUserId: 'owner',
        });
      });

      it('повторное согласие после отзыва переоткрывает ту же строку журнала', async () => {
        await service.respond('owner', 'req-1', { accept: true }, now);

        // upsert по паре ownerId+viewerId: снимается revokedAt у существующей
        // записи, второй строки в журнале не появляется.
        expect(upsertArg(prisma.contactsDisclosure.upsert).update).toEqual(
          expect.objectContaining({ revokedAt: null, requestId: 'req-1' }),
        );
      });

      it('отказ никого не уведомляет', async () => {
        // Отказ — не новость, о которой стоит присылать пуш: он только
        // подчеркнул бы его. Человек увидит статус, когда зайдёт сам.
        await service.respond('owner', 'req-1', { accept: false }, now);

        expect(events.emit).not.toHaveBeenCalled();
      });

      it('ОТКАЗ БЕЗ ГАЛОЧКИ НИКОГО НЕ СКРЫВАЕТ', async () => {
        // Принципиальное отличие от Union, где отказ скрывает автоматически.
        // Отказ дать телефон и желание исчезнуть из справочника — разные вещи.
        await service.respond('owner', 'req-1', { accept: false }, now);

        expect(moderation.hideFrom).not.toHaveBeenCalled();
        expect(prisma.contactsRequest.update).toHaveBeenCalledWith({
          where: { id: 'req-1' },
          data: { status: 'declined', respondedAt: now },
        });
        expect(prisma.contactsDisclosure.upsert).not.toHaveBeenCalled();
      });

      it('отказ с hideFromRequester скрывает в скоупе contacts', async () => {
        await service.respond(
          'owner',
          'req-1',
          { accept: false, hideFromRequester: true },
          now,
        );

        expect(moderation.hideFrom).toHaveBeenCalledWith({
          ownerId: 'owner',
          viewerId: 'viewer',
          source: 'manual',
          scope: 'contacts',
        });
      });

      it('отказ с hideFromRequester: false тоже не скрывает', async () => {
        await service.respond(
          'owner',
          'req-1',
          { accept: false, hideFromRequester: false },
          now,
        );

        expect(moderation.hideFrom).not.toHaveBeenCalled();
      });

      it('требует явного решения по запросу', async () => {
        await expect(
          service.respond('owner', 'req-1', {} as never, now),
        ).rejects.toThrow('Укажите решение по запросу');
      });
    });
  });

  describe('cancel', () => {
    it('отправитель отзывает свой pending запрос', async () => {
      prisma.contactsRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        fromUserId: 'viewer',
        status: 'pending',
      });

      await service.cancel('viewer', 'req-1', now);

      expect(prisma.contactsRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: { status: 'cancelled', respondedAt: now },
      });
    });

    it('чужой запрос отозвать нельзя', async () => {
      prisma.contactsRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        fromUserId: 'viewer',
        status: 'pending',
      });

      await expect(service.cancel('owner', 'req-1', now)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('рассмотренный запрос отозвать нельзя', async () => {
      prisma.contactsRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        fromUserId: 'viewer',
        status: 'accepted',
      });

      await expect(service.cancel('viewer', 'req-1', now)).rejects.toThrow(
        'Запрос уже рассмотрен',
      );
    });
  });

  describe('журнал раскрытий', () => {
    it('показывает и действующие, и отозванные записи', async () => {
      prisma.contactsDisclosure.findMany.mockResolvedValue([
        {
          id: 'disc-1',
          viewer: party('viewer'),
          grantedAt: new Date('2026-08-10T00:00:00.000Z'),
          revokedAt: null,
        },
        {
          id: 'disc-2',
          viewer: party('other'),
          grantedAt: new Date('2026-08-01T00:00:00.000Z'),
          revokedAt: new Date('2026-08-05T00:00:00.000Z'),
        },
      ]);

      const state = await service.listDisclosures('owner');

      expect(state.items).toEqual([
        expect.objectContaining({ id: 'disc-1', revokedAt: null }),
        expect.objectContaining({
          id: 'disc-2',
          revokedAt: '2026-08-05T00:00:00.000Z',
        }),
      ]);
    });

    it('отзыв проставляет дату, а не удаляет строку', async () => {
      prisma.contactsDisclosure.findUnique.mockResolvedValue({
        id: 'disc-1',
        ownerId: 'owner',
        revokedAt: null,
      });

      await service.revokeDisclosure('owner', 'disc-1', now);

      expect(prisma.contactsDisclosure.update).toHaveBeenCalledWith({
        where: { id: 'disc-1' },
        data: { revokedAt: now },
      });
    });

    it('повторный отзыв идемпотентен и не переписывает дату', async () => {
      prisma.contactsDisclosure.findUnique.mockResolvedValue({
        id: 'disc-1',
        ownerId: 'owner',
        revokedAt: new Date('2026-08-05T00:00:00.000Z'),
      });

      await service.revokeDisclosure('owner', 'disc-1', now);

      expect(prisma.contactsDisclosure.update).not.toHaveBeenCalled();
    });

    it('чужое раскрытие отозвать нельзя', async () => {
      prisma.contactsDisclosure.findUnique.mockResolvedValue({
        id: 'disc-1',
        ownerId: 'owner',
        revokedAt: null,
      });

      await expect(
        service.revokeDisclosure('stranger', 'disc-1', now),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
