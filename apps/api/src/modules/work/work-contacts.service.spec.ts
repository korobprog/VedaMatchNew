import { Prisma } from '@prisma/client';
import { WorkContactsService } from './work-contacts.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PortalAccessService } from '../access/access.service';
import type { WorkSpacesService } from './work-spaces.service';

const ARTEM = {
  id: 'u-artem',
  name: 'Артём Мещеряков',
  spiritualName: null,
  avatarUrl: null,
};

/**
 * Сервис с подменённой базой. Настоящий SQL не выполняется — вместо него
 * запоминается запрос: проверять здесь нужно, кого и по какому правилу
 * сервис спрашивает, а не работу Postgres.
 */
function createService(options: {
  role: string;
  /** Кого вернёт поиск по всему порталу. */
  portalRows?: (typeof ARTEM)[];
  /** Кто числится знакомым спрашивающего. */
  knownIds?: string[];
  /** Кого из них база отдаст как активных людей. */
  knownRows?: (typeof ARTEM)[];
}) {
  const queries: Prisma.Sql[] = [];
  const prisma = {
    user: {
      findUnique: jest.fn(() => Promise.resolve({ role: options.role })),
      findMany: jest.fn(() => Promise.resolve(options.knownRows ?? [])),
    },
    workSpaceMember: {
      findMany: jest.fn(() => Promise.resolve([])),
    },
    workInvite: {
      findMany: jest.fn(() => Promise.resolve([])),
    },
    $queryRaw: jest.fn((sql: Prisma.Sql) => {
      queries.push(sql);
      return Promise.resolve(options.portalRows ?? []);
    }),
  } as unknown as PrismaService;

  const access = {
    grantersFor: jest.fn(() =>
      Promise.resolve(
        (options.knownIds ?? []).map((id) => ({ granterId: id })),
      ),
    ),
    granteesOf: jest.fn(() => Promise.resolve([])),
  } as unknown as PortalAccessService;

  const spaces = {
    roleOf: jest.fn(() => Promise.resolve('owner')),
  } as unknown as WorkSpacesService;

  return {
    service: new WorkContactsService(prisma, access, spaces),
    prisma,
    queries,
  };
}

describe('WorkContactsService', () => {
  // Ради этого правило и менялось: администратор портала — «друг всех», и
  // звать он должен любого, а не только своих личных знакомых.
  it('администратору ищет по всему порталу', async () => {
    const { service, prisma } = createService({
      role: 'admin',
      portalRows: [ARTEM],
    });

    const result = await service.listFor('space-1', 'u-admin', 'артем');

    expect(result.scope).toBe('portal');
    expect(result.items.map((item) => item.name)).toEqual(['Артём Мещеряков']);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('обычному человеку — только знакомых', async () => {
    const { service, prisma } = createService({
      role: 'user',
      knownIds: ['u-artem'],
      knownRows: [ARTEM],
    });

    const result = await service.listFor('space-1', 'u-someone', 'артем');

    expect(result.scope).toBe('known');
    expect(result.items.map((item) => item.userId)).toEqual(['u-artem']);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('не знакомого обычному человеку не показывает', async () => {
    const { service } = createService({ role: 'user', knownIds: [] });

    const result = await service.listFor('space-1', 'u-someone', 'артем');

    expect(result.items).toEqual([]);
    expect(result.scope).toBe('known');
  });

  it('без запроса портал не перечисляет', async () => {
    const { service, prisma } = createService({ role: 'admin' });

    const result = await service.listFor('space-1', 'u-admin', ' ');

    expect(result.items).toEqual([]);
    expect(result.minQuery).toBe(2);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  describe('запрос по порталу', () => {
    it('складывает ё с е и экранирует по одному символу', async () => {
      const { service, queries } = createService({ role: 'admin' });

      await service.listFor('space-1', 'u-admin', 'Артём');

      const sql = queries[0];
      const text = sql.strings.join('?');
      // Настоящий обратный слэш, а не пустая строка: `ESCAPE ''` Postgres
      // отвергает, и в шаблонной строке это ловится только глазами.
      expect(text).toContain(String.raw`ESCAPE '\'`);
      expect(text).toContain(`translate(lower(u."name"), 'ё', 'е')`);
      // Запрос уехал параметром, а не склейкой в текст
      expect(sql.values).toContain('%артем%');
      expect(text).not.toContain('артем');
    });

    it('проценты и подчёркивания из запроса не работают как маска', async () => {
      const { service, queries } = createService({ role: 'admin' });

      await service.listFor('space-1', 'u-admin', '100%_');

      expect(queries[0]?.values).toContain(String.raw`%100\%\_%`);
    });

    it('отсеивает уже состоящих в среде и самого спрашивающего', async () => {
      const { service, queries } = createService({ role: 'admin' });

      await service.listFor('space-1', 'u-admin', 'артем');

      const text = queries[0]?.strings.join('?') ?? '';
      expect(text).toContain('NOT EXISTS');
      expect(text).toContain('"WorkSpaceMember"');
      expect(text).toContain('u."id" <>');
      expect(queries[0]?.values).toContain('u-admin');
      expect(queries[0]?.values).toContain('space-1');
    });
  });
});
