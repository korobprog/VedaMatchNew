import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ModerationService } from '../../moderation/moderation.service';
import { PeopleAvatarService } from './people-avatar.service';
import { PeopleService } from './people.service';

const now = new Date('2026-08-13T10:00:00.000Z');

type Overrides = Record<string, unknown>;

function tag(id: string, overrides: Overrides = {}) {
  return {
    id,
    slug: `slug-${id}`,
    kind: 'service',
    nameRu: `Тег ${id}`,
    sortOrder: 1,
    ...overrides,
  };
}

function owner(overrides: Overrides = {}) {
  return {
    id: 'owner',
    name: 'Радха',
    avatarUrl: 'https://cdn/avatar.png',
    avatarKey: null,
    birthDate: new Date('1990-08-13T00:00:00.000Z'),
    homeLocation: { city: 'Москва', country: 'Россия', lat: 1, lon: 2 },
    spiritualStage: 'devotee',
    devoteeVerificationStatus: 'confirmed',
    photoVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function viewer(overrides: Overrides = {}) {
  return owner({
    id: 'viewer',
    name: 'Кришна',
    spiritualStage: 'practitioner',
    devoteeVerificationStatus: null,
    ...overrides,
  });
}

function profile(overrides: Overrides = {}) {
  return {
    id: 'profile-1',
    userId: 'owner',
    headline: 'Повар-прасадарий',
    about: 'Готовлю на праздники',
    offers: 'Помогу с кухней',
    languages: ['русский'],
    ashram: 'grihastha',
    format: 'offline',
    visibility: 'everyone',
    status: 'active',
    pausedUntil: null,
    fieldPrivacy: null,
    requestsFromVerifiedOnly: false,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-02T00:00:00.000Z'),
    tags: [{ tag: tag('tag-1') }],
    user: owner(),
    ...overrides,
  };
}

describe('PeopleService', () => {
  const prisma = {
    contactsProfile: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
    },
    contactsProfileTag: { deleteMany: jest.fn(), createMany: jest.fn() },
    contactsTag: { findMany: jest.fn() },
    contactsDisclosure: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };
  const moderation = { isHidden: jest.fn(), hiddenUserIds: jest.fn() };
  const users = { resolveAvatarUrl: jest.fn() };
  const service = new PeopleService(
    prisma as unknown as PrismaService,
    moderation as unknown as ModerationService,
    users as unknown as PeopleAvatarService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    moderation.isHidden.mockResolvedValue(false);
    moderation.hiddenUserIds.mockResolvedValue(new Set<string>());
    // По умолчанию раскрытия нет: контакты закрыты, пока владелец не согласился.
    prisma.contactsDisclosure.findFirst.mockResolvedValue(null);
    users.resolveAvatarUrl.mockImplementation((user: { avatarUrl: string }) =>
      Promise.resolve(user.avatarUrl),
    );
    // Транзакция в тестах — просто вызов колбэка с тем же мок-клиентом.
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn(prisma)),
    );
  });

  describe('getState', () => {
    it('заводит активную карточку, когда её ещё нет', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(null);
      prisma.contactsProfile.create.mockResolvedValue(
        profile({ headline: null, tags: [] }),
      );

      const state = await service.getState('owner');

      expect(prisma.contactsProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userId: 'owner', status: 'active', visibility: 'everyone' },
        }),
      );
      expect(state.profile).toEqual(
        expect.objectContaining({ status: 'active', visibility: 'everyone' }),
      );
    });

    it('не пересоздаёт карточку, когда она уже есть', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(profile());

      await service.getState('owner');

      expect(prisma.contactsProfile.create).not.toHaveBeenCalled();
    });

    it('переживает гонку двух входов: P2002 отдаёт чужую созданную карточку', async () => {
      const conflict = new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prisma.contactsProfile.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(profile());
      prisma.contactsProfile.create.mockRejectedValue(conflict);

      const state = await service.getState('owner');

      expect(state.profile).toEqual(
        expect.objectContaining({ headline: 'Повар-прасадарий' }),
      );
    });

    it('отдаёт свою карточку целиком, без применения приватности', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(
        profile({ fieldPrivacy: { city: 'hidden', photo: 'hidden' } }),
      );

      const state = await service.getState('owner');

      expect(state.profile).toEqual(
        expect.objectContaining({
          headline: 'Повар-прасадарий',
          visibility: 'everyone',
          status: 'active',
          tagIds: ['tag-1'],
          fieldPrivacy: { city: 'hidden', photo: 'hidden' },
        }),
      );
    });
  });

  describe('listTags', () => {
    it('сортирует теги по разделу и порядку', async () => {
      prisma.contactsTag.findMany.mockResolvedValue([tag('a'), tag('b')]);

      await expect(service.listTags()).resolves.toEqual({
        items: [
          { id: 'a', slug: 'slug-a', kind: 'service', nameRu: 'Тег a' },
          { id: 'b', slug: 'slug-b', kind: 'service', nameRu: 'Тег b' },
        ],
      });
      expect(prisma.contactsTag.findMany).toHaveBeenCalledWith({
        orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
      });
    });
  });

  describe('getCard: правила видимости', () => {
    it('404, когда карточки нет', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(null);

      await expect(service.getCard('viewer', 'owner', now)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404, когда карточка не активна', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(
        profile({ status: 'draft' }),
      );

      await expect(service.getCard('viewer', 'owner', now)).rejects.toThrow(
        'Карточка не найдена',
      );
    });

    it('404, когда карточка на паузе', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(
        profile({ pausedUntil: new Date(now.getTime() + 86_400_000) }),
      );

      await expect(service.getCard('viewer', 'owner', now)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('показывает карточку, когда пауза уже закончилась', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(
        profile({ pausedUntil: new Date(now.getTime() - 1000) }),
      );

      await expect(service.getCard('viewer', 'owner', now)).resolves.toEqual(
        expect.objectContaining({ userId: 'owner' }),
      );
    });

    it('404, когда владелец скрыт от зрителя (скоуп contacts)', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(profile());
      moderation.isHidden.mockResolvedValue(true);

      await expect(service.getCard('viewer', 'owner', now)).rejects.toThrow(
        NotFoundException,
      );
      expect(moderation.isHidden).toHaveBeenCalledWith(
        'viewer',
        'owner',
        'contacts',
      );
    });

    it('404 при visibility hidden', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(
        profile({ visibility: 'hidden' }),
      );

      await expect(service.getCard('viewer', 'owner', now)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('показывает карточку by_link: прямая ссылка — это и есть маршрут', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(
        profile({ visibility: 'by_link' }),
      );

      await expect(service.getCard('viewer', 'owner', now)).resolves.toEqual(
        expect.objectContaining({ userId: 'owner' }),
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('404 при verified_only, если зритель не подтверждён', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(
        profile({ visibility: 'verified_only' }),
      );
      prisma.user.findUnique.mockResolvedValue(viewer());

      await expect(service.getCard('viewer', 'owner', now)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('показывает verified_only подтверждённому преданному', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(
        profile({ visibility: 'verified_only' }),
      );
      prisma.user.findUnique.mockResolvedValue(
        viewer({
          spiritualStage: 'devotee',
          devoteeVerificationStatus: 'confirmed',
        }),
      );

      await expect(service.getCard('viewer', 'owner', now)).resolves.toEqual(
        expect.objectContaining({ userId: 'owner' }),
      );
    });

    it('same_city: совпадение города без учёта регистра и пробелов', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(
        profile({ visibility: 'same_city' }),
      );
      prisma.user.findUnique.mockResolvedValue(
        viewer({ homeLocation: { city: '  москва ', lat: 1, lon: 2 } }),
      );

      await expect(service.getCard('viewer', 'owner', now)).resolves.toEqual(
        expect.objectContaining({ userId: 'owner' }),
      );
    });

    it('404 при same_city и другом городе', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(
        profile({ visibility: 'same_city' }),
      );
      prisma.user.findUnique.mockResolvedValue(
        viewer({ homeLocation: { city: 'Киев', lat: 1, lon: 2 } }),
      );

      await expect(service.getCard('viewer', 'owner', now)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404 при same_city, если город зрителя не заполнен', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(
        profile({ visibility: 'same_city' }),
      );
      prisma.user.findUnique.mockResolvedValue(viewer({ homeLocation: null }));

      await expect(service.getCard('viewer', 'owner', now)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404 при same_city, если город владельца не заполнен', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(
        profile({ visibility: 'same_city', user: owner({ homeLocation: {} }) }),
      );
      prisma.user.findUnique.mockResolvedValue(viewer());

      await expect(service.getCard('viewer', 'owner', now)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('отказ — это 404, а не 403: 403 подтвердил бы существование карточки', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(
        profile({ visibility: 'hidden' }),
      );

      const error = await service
        .getCard('viewer', 'owner', now)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error).not.toBeInstanceOf(ForbiddenException);
    });

    it('владелец видит свою карточку даже при visibility hidden и паузе', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(
        profile({
          visibility: 'hidden',
          status: 'draft',
          pausedUntil: new Date(now.getTime() + 86_400_000),
          fieldPrivacy: { city: 'hidden', photo: 'hidden', age: 'hidden' },
        }),
      );

      const card = await service.getCard('owner', 'owner', now);

      expect(card).toEqual(
        expect.objectContaining({
          userId: 'owner',
          city: 'Москва',
          avatarUrl: 'https://cdn/avatar.png',
          age: 36,
        }),
      );
      expect(moderation.isHidden).not.toHaveBeenCalled();
    });
  });

  describe('getCard: содержимое карточки', () => {
    it('не отдаёт контакты без раскрытия', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(profile());

      const card = await service.getCard('viewer', 'owner', now);

      expect(card.contacts).toBeNull();
      expect(prisma.contactsDisclosure.findFirst).toHaveBeenCalledWith({
        where: { ownerId: 'owner', viewerId: 'viewer', revokedAt: null },
        select: { id: true },
      });
    });

    it('отдаёт контакты при действующем раскрытии', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(
        profile({
          user: owner({
            socialLinks: { telegram: '@radha' },
            messengers: { phone: '+7000', whatsapp: '+7000' },
          }),
        }),
      );
      prisma.contactsDisclosure.findFirst.mockResolvedValue({ id: 'disc-1' });

      const card = await service.getCard('viewer', 'owner', now);

      expect(card.contacts).toEqual({
        socialLinks: { telegram: '@radha' },
        messengers: { phone: '+7000', whatsapp: '+7000' },
      });
    });

    it('после отзыва контакты снова null: отозванное раскрытие не находится', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(
        profile({ user: owner({ messengers: { phone: '+7000' } }) }),
      );
      // Строка в журнале осталась, но с revokedAt — условие `revokedAt: null`
      // её не выбирает, поэтому findFirst возвращает null.
      prisma.contactsDisclosure.findFirst.mockResolvedValue(null);

      const card = await service.getCard('viewer', 'owner', now);

      expect(card.contacts).toBeNull();
    });

    it('прячет город и страну при city: hidden', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(
        profile({ fieldPrivacy: { city: 'hidden' } }),
      );

      const card = await service.getCard('viewer', 'owner', now);

      expect(card.city).toBeNull();
      expect(card.country).toBeNull();
      expect(card.avatarUrl).toBe('https://cdn/avatar.png');
    });

    it('прячет аватар при photo: hidden', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(
        profile({ fieldPrivacy: { photo: 'hidden' } }),
      );

      const card = await service.getCard('viewer', 'owner', now);

      expect(card.avatarUrl).toBeNull();
      expect(users.resolveAvatarUrl).not.toHaveBeenCalled();
    });

    it('прячет возраст при age: hidden', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(
        profile({ fieldPrivacy: { age: 'hidden' } }),
      );

      const card = await service.getCard('viewer', 'owner', now);

      expect(card.age).toBeNull();
    });

    it('отдаёт открытые поля и признаки доверия', async () => {
      prisma.contactsProfile.findUnique.mockResolvedValue(profile());

      const card = await service.getCard('viewer', 'owner', now);

      expect(card).toEqual(
        expect.objectContaining({
          name: 'Радха',
          headline: 'Повар-прасадарий',
          city: 'Москва',
          country: 'Россия',
          age: 36,
          isVerifiedDevotee: true,
          isPhotoVerified: true,
          tags: [
            {
              id: 'tag-1',
              slug: 'slug-tag-1',
              kind: 'service',
              nameRu: 'Тег tag-1',
            },
          ],
        }),
      );
    });
  });

  describe('upsertProfile', () => {
    function expectSaved() {
      const calls = prisma.contactsProfile.upsert.mock.calls as [
        { update: Record<string, unknown> },
      ][];
      return calls[0][0].update;
    }

    beforeEach(() => {
      prisma.contactsProfile.findUnique.mockResolvedValue(null);
      prisma.contactsProfile.upsert.mockResolvedValue({ id: 'profile-1' });
      prisma.contactsProfileTag.deleteMany.mockResolvedValue({ count: 0 });
      prisma.contactsProfileTag.createMany.mockResolvedValue({ count: 0 });
    });

    /** Второй findUnique в транзакции возвращает сохранённую карточку. */
    function stubSave(existing: unknown, saved: unknown) {
      prisma.contactsProfile.findUnique
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(saved);
    }

    it('оставляет карточку активной, когда заголовка нет', async () => {
      stubSave(null, profile({ headline: null, status: 'active', tags: [] }));

      const dto = await service.upsertProfile(
        'owner',
        { about: 'Привет' },
        now,
      );

      // Пустой заголовок раньше ронял карточку в 'draft', и человек молча
      // пропадал из справочника. Уход из выдачи — только через visibility.
      expect(expectSaved().status).toBe('active');
      expect(dto.status).toBe('active');
    });

    it('делает карточку активной, когда заголовок заполнен', async () => {
      stubSave(null, profile());

      await service.upsertProfile('owner', { headline: '  Пуджари  ' }, now);

      expect(expectSaved()).toEqual(
        expect.objectContaining({ headline: 'Пуджари', status: 'active' }),
      );
    });

    it('превращает пустые строки в null', async () => {
      stubSave(null, profile());

      await service.upsertProfile('owner', { offers: '' }, now);

      expect(expectSaved()).toEqual(expect.objectContaining({ offers: null }));
    });

    it('рассказ и языки в карточку не пишутся: они портальные', async () => {
      // Их редактирует профиль портала, и присланные сюда значения карточка
      // молча игнорирует — иначе завелась бы вторая, расходящаяся копия.
      stubSave(null, profile());

      await service.upsertProfile(
        'owner',
        {
          headline: 'Пуджари',
          about: 'Пришло из старого клиента',
          languages: ['русский'],
        } as never,
        now,
      );

      const saved = expectSaved() as Record<string, unknown>;
      expect(saved.headline).toBe('Пуджари');
      expect(saved).not.toHaveProperty('about');
      expect(saved).not.toHaveProperty('languages');
    });

    it('отклоняет слишком длинный заголовок', async () => {
      await expect(
        service.upsertProfile('owner', { headline: 'я'.repeat(121) }, now),
      ).rejects.toThrow(BadRequestException);
    });

    it('отклоняет больше двенадцати тегов', async () => {
      const tagIds = Array.from({ length: 13 }, (_, i) => `tag-${i}`);

      await expect(
        service.upsertProfile('owner', { tagIds }, now),
      ).rejects.toThrow('Тегов не больше 12');
    });

    it('отклоняет несуществующий тег', async () => {
      prisma.contactsTag.findMany.mockResolvedValue([{ id: 'tag-1' }]);

      await expect(
        service.upsertProfile('owner', { tagIds: ['tag-1', 'tag-x'] }, now),
      ).rejects.toThrow('Указан несуществующий тег');
      expect(prisma.contactsProfile.upsert).not.toHaveBeenCalled();
    });

    it('пересобирает связи с тегами под переданный список', async () => {
      prisma.contactsTag.findMany.mockResolvedValue([
        { id: 'tag-1' },
        { id: 'tag-2' },
      ]);
      stubSave(null, profile());

      await service.upsertProfile('owner', { tagIds: ['tag-1', 'tag-2'] }, now);

      expect(prisma.contactsProfileTag.deleteMany).toHaveBeenCalledWith({
        where: { profileId: 'profile-1' },
      });
      expect(prisma.contactsProfileTag.createMany).toHaveBeenCalledWith({
        data: [
          { profileId: 'profile-1', tagId: 'tag-1' },
          { profileId: 'profile-1', tagId: 'tag-2' },
        ],
      });
    });

    it('не трогает теги, если список не передан', async () => {
      stubSave(null, profile());

      await service.upsertProfile('owner', { headline: 'Пуджари' }, now);

      expect(prisma.contactsProfileTag.deleteMany).not.toHaveBeenCalled();
    });

    it('отклоняет паузу в прошлом', async () => {
      await expect(
        service.upsertProfile(
          'owner',
          { pausedUntil: '2026-08-12T10:00:00.000Z' },
          now,
        ),
      ).rejects.toThrow('Пауза: дата должна быть в будущем');
    });

    it('принимает паузу в будущем и снятие паузы', async () => {
      stubSave(null, profile());

      await service.upsertProfile(
        'owner',
        { pausedUntil: '2026-09-01T10:00:00.000Z' },
        now,
      );

      expect(expectSaved().pausedUntil).toEqual(
        new Date('2026-09-01T10:00:00.000Z'),
      );
    });

    it('отклоняет некорректную дату паузы', async () => {
      await expect(
        service.upsertProfile('owner', { pausedUntil: 'завтра' }, now),
      ).rejects.toThrow(BadRequestException);
    });

    it('отклоняет неизвестные visibility, format, ashram', async () => {
      await expect(
        service.upsertProfile('owner', { visibility: 'friends' as never }, now),
      ).rejects.toThrow('Недопустимое значение: видимость');
      await expect(
        service.upsertProfile('owner', { format: 'letter' as never }, now),
      ).rejects.toThrow('Недопустимое значение: формат');
      await expect(
        service.upsertProfile('owner', { ashram: 'guru' as never }, now),
      ).rejects.toThrow('Недопустимое значение: ашрам');
    });

    it('отклоняет неизвестный уровень приватности поля', async () => {
      await expect(
        service.upsertProfile(
          'owner',
          { fieldPrivacy: { city: 'matched' as never } },
          now,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('сохраняет прежние значения для непереданных полей', async () => {
      stubSave(
        profile({ headline: 'Пуджари', visibility: 'by_link' }),
        profile(),
      );

      await service.upsertProfile('owner', { offers: 'Новое' }, now);

      expect(expectSaved()).toEqual(
        expect.objectContaining({
          headline: 'Пуджари',
          visibility: 'by_link',
          offers: 'Новое',
          status: 'active',
        }),
      );
    });
  });

  describe('search', () => {
    /**
     * Условие видимости живёт в SQL, поэтому здесь проверяется, что сервис
     * складывает запросы правильно и одинаково; сами условия разобраны
     * по кускам в `contacts-search-query.spec.ts`, а поведение на настоящих
     * данных — живым прогоном по БД.
     */
    function stubSearch(
      options: {
        ids?: string[];
        total?: number;
        facets?: Array<{ tagId: string; count: number }>;
        profiles?: unknown[];
      } = {},
    ) {
      const ids = options.ids ?? [];
      prisma.$queryRaw
        .mockResolvedValueOnce(ids.map((id) => ({ id })))
        .mockResolvedValueOnce([{ count: options.total ?? ids.length }])
        .mockResolvedValueOnce(options.facets ?? []);
      prisma.contactsProfile.findMany.mockResolvedValue(options.profiles ?? []);
    }

    function sqlOf(callIndex: number): Prisma.Sql {
      const calls = prisma.$queryRaw.mock.calls as unknown as Prisma.Sql[][];
      return calls[callIndex][0];
    }

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(viewer());
    });

    it('выбирает выдачу, счётчик и фасеты по одному и тому же условию', async () => {
      stubSearch({ ids: ['profile-1'], profiles: [profile()] });

      await service.search('viewer', {}, now);

      const [items, total, facets] = [sqlOf(0), sqlOf(1), sqlOf(2)];
      expect(items.text).toContain('WHERE');
      const condition = (sql: Prisma.Sql) =>
        sql.text
          .slice(sql.text.indexOf('WHERE'))
          .split(/ORDER BY|LIMIT|GROUP BY/)[0]
          .replace(/\s+/g, ' ')
          .trim();
      expect(condition(total)).toBe(condition(items));
      expect(condition(facets)).toBe(condition(total));
    });

    it('не показывает by_link, скрытых и самого смотрящего', async () => {
      moderation.hiddenUserIds.mockResolvedValue(new Set(['declined']));
      stubSearch();

      await service.search('viewer', {}, now);

      const sql = sqlOf(0);
      expect(sql.text).toContain(`p."visibility" = 'everyone'`);
      expect(sql.text).not.toContain('by_link');
      expect(sql.text).toContain(`p."userId" <> `);
      expect(sql.text).toContain(`p."userId" NOT IN `);
      expect(sql.values).toEqual(
        expect.arrayContaining(['viewer', 'declined']),
      );
      expect(moderation.hiddenUserIds).toHaveBeenCalledWith(
        'viewer',
        'contacts',
      );
    });

    it('исключает карточки на паузе датой запроса', async () => {
      stubSearch();

      await service.search('viewer', {}, now);

      expect(sqlOf(0).text).toContain(
        `(p."pausedUntil" IS NULL OR p."pausedUntil" <= `,
      );
      expect(sqlOf(0).values).toEqual(expect.arrayContaining([now]));
    });

    it('скрывает точное число совпадений ниже порога', async () => {
      stubSearch({ ids: ['profile-1'], total: 4, profiles: [profile()] });

      const result = await service.search('viewer', {}, now);

      expect(result.total).toBeNull();
      // hasMore считается по настоящему числу, а не по спрятанному.
      expect(result.hasMore).toBe(true);
    });

    it('называет число совпадений на пороге и выше', async () => {
      stubSearch({ ids: ['profile-1'], total: 5, profiles: [profile()] });

      await expect(service.search('viewer', {}, now)).resolves.toEqual(
        expect.objectContaining({ total: 5 }),
      );
    });

    it('отдаёт фасеты без обрезки по порогу', async () => {
      // Фасеты считаются по тому же условию видимости, что и выдача, поэтому
      // сверх неё ничего не раскрывают. Обрезка выкосила бы почти все чипы:
      // редким служением на город занят обычно один человек.
      stubSearch({
        total: 12,
        facets: [
          { tagId: 'popular', count: 9 },
          { tagId: 'rare', count: 2 },
        ],
      });

      const result = await service.search('viewer', {}, now);

      expect(result.facets).toEqual([
        { tagId: 'popular', count: 9 },
        { tagId: 'rare', count: 2 },
      ]);
    });

    it('обрезает размер страницы и нормализует номер', async () => {
      stubSearch();

      const result = await service.search(
        'viewer',
        { pageSize: '500', page: '0' },
        now,
      );

      expect(result).toEqual(
        expect.objectContaining({ page: 1, pageSize: 50 }),
      );
      expect(sqlOf(0).values).toEqual(expect.arrayContaining([50, 0]));
    });

    it('листает страницы смещением, а не отбрасыванием в памяти', async () => {
      stubSearch();

      await service.search('viewer', { page: '3', pageSize: '10' }, now);

      expect(sqlOf(0).values).toEqual(expect.arrayContaining([10, 20]));
      expect(sqlOf(0).text).toContain('ORDER BY');
      // Финальный tiebreak по id: без него страницы теряют и дублируют записи.
      expect(sqlOf(0).text).toContain('p."createdAt" DESC, p."id" DESC');
    });

    it('отказывает в поиске по радиусу без координат у смотрящего', async () => {
      prisma.user.findUnique.mockResolvedValue(
        viewer({ homeLocation: { city: 'Москва', country: 'Россия' } }),
      );

      await expect(
        service.search('viewer', { radiusKm: '50' }, now),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.search('viewer', { radiusKm: '50' }, now),
      ).rejects.toThrow('Поиск по радиусу требует');
    });

    it('в выдаче применяет приватность полей и никогда не отдаёт контакты', async () => {
      stubSearch({
        ids: ['profile-1'],
        total: 7,
        profiles: [
          profile({ fieldPrivacy: { city: 'hidden', age: 'hidden' } }),
        ],
      });

      const result = await service.search('viewer', {}, now);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          userId: 'owner',
          city: null,
          country: null,
          age: null,
          contacts: null,
        }),
      );
    });

    it('не отдаёт контакты в выдаче даже при действующем раскрытии', async () => {
      // Анти-скрапинг: справочник не раздаёт способы связи пачкой. Открытые
      // контакты видны на карточке и в списке запросов, но не в поиске.
      prisma.contactsDisclosure.findFirst.mockResolvedValue({ id: 'disc-1' });
      stubSearch({
        ids: ['profile-1'],
        total: 7,
        profiles: [
          profile({ user: owner({ messengers: { phone: '+7000' } }) }),
        ],
      });

      const result = await service.search('viewer', {}, now);

      expect(result.items[0].contacts).toBeNull();
      expect(prisma.contactsDisclosure.findFirst).not.toHaveBeenCalled();
    });

    it('сохраняет порядок, заданный SQL, при догрузке карточек', async () => {
      stubSearch({
        ids: ['profile-2', 'profile-1'],
        total: 9,
        profiles: [
          profile(),
          profile({
            id: 'profile-2',
            userId: 'other',
            user: owner({ id: 'other' }),
          }),
        ],
      });

      const result = await service.search('viewer', {}, now);

      expect(result.items.map((card) => card.userId)).toEqual([
        'other',
        'owner',
      ]);
    });
  });

  describe('mapPoints', () => {
    function stubMap(points: unknown[] = [], withoutLocation = 0): void {
      prisma.user.findUnique.mockResolvedValue(viewer());
      prisma.$queryRaw
        .mockResolvedValueOnce(points)
        .mockResolvedValueOnce([{ count: withoutLocation }]);
    }

    function mapSql(callIndex: number): Prisma.Sql {
      const calls = prisma.$queryRaw.mock.calls as unknown as Prisma.Sql[][];
      return calls[callIndex][0];
    }

    it('сворачивает людей в города со счётчиком', async () => {
      stubMap([
        {
          city: 'Хабаровск',
          country: 'Россия',
          lat: 48.4813,
          lon: 135.0763,
          count: 4,
        },
      ]);

      await expect(service.mapPoints('viewer', {}, now)).resolves.toEqual({
        points: [
          {
            city: 'Хабаровск',
            country: 'Россия',
            lat: 48.4813,
            lon: 135.0763,
            count: 4,
          },
        ],
        withoutLocation: 0,
      });
      expect(mapSql(0).text).toContain('GROUP BY');
    });

    it('строит точки по тому же условию видимости, что и выдача', async () => {
      moderation.hiddenUserIds.mockResolvedValue(new Set(['declined']));
      stubMap();

      await service.mapPoints('viewer', {}, now);

      const sql = mapSql(0);
      expect(sql.text).toContain(`p."status" = 'active'`);
      expect(sql.text).toContain(`p."userId" <> `);
      expect(sql.text).toContain(`p."userId" NOT IN `);
      expect(sql.text).not.toContain('by_link');
      expect(sql.values).toEqual(
        expect.arrayContaining(['viewer', 'declined']),
      );
    });

    it('не выводит на карту тех, кто скрыл город', async () => {
      // Иначе метка «Омск · 3» показала бы ровно то, что человек спрятал.
      stubMap([], 3);

      const result = await service.mapPoints('viewer', {}, now);

      expect(mapSql(0).text).toContain(
        `COALESCE(p."fieldPrivacy"->>'city', 'everyone') <> 'hidden'`,
      );
      // Их не теряем молча — карта должна суметь сказать «ещё 3 без города».
      expect(result.withoutLocation).toBe(3);
      expect(mapSql(1).text).toContain('NOT (');
    });

    it('принимает центр с карты вместо города смотрящего', async () => {
      stubMap();

      await service.mapPoints(
        'viewer',
        { radiusKm: '200', lat: '48.4813', lon: '135.0763' },
        now,
      );

      expect(mapSql(0).values).toEqual(
        expect.arrayContaining([48.4813, 135.0763]),
      );
    });
  });
});
