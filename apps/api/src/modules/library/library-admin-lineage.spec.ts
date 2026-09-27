import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  RequestMethod,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

// AuthGuard тянет за собой jose (ESM), который jest не разбирает.
jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class AuthGuard {},
  CurrentUser: () => () => undefined,
}));

import { LibraryAdminController } from './library-admin.controller';
import { LibraryAdminService } from './library-admin.service';
import type { PrismaService } from '../../prisma/prisma.service';

const admin = { sub: 'admin-1', role: 'admin' } as never;
const libraryAdmin = {
  sub: 'sa-1',
  role: 'service-admin',
  adminServices: ['library'],
} as never;
const musicAdmin = {
  sub: 'sa-2',
  role: 'service-admin',
  adminServices: ['music'],
} as never;
const member = { sub: 'user-1', role: 'user' } as never;

function createService(category: Record<string, unknown> | null) {
  const prisma = {
    libraryCategory: {
      findUnique: jest.fn().mockResolvedValue(category),
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'author-1' }, { id: 'lectures-1' }]),
      update: jest.fn(({ data }: { data: { lineage: string | null } }) =>
        Promise.resolve({ id: 'author-1', lineage: data.lineage }),
      ),
    },
    libraryEntry: {
      findUnique: jest.fn().mockResolvedValue({ id: 'entry-1' }),
      update: jest.fn(({ data }: { data: { lineage: string | null } }) =>
        Promise.resolve({ id: 'entry-1', lineage: data.lineage }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 7 }),
    },
  };
  const events = { emit: jest.fn() };
  const service = new LibraryAdminService(
    prisma as unknown as PrismaService,
    events as never,
  );
  return { service, prisma, events };
}

const author = {
  id: 'author-1',
  status: 'active',
  lineage: 'sri_chaitanya_saraswat_math',
  titleRu: 'Ари Мардан Прабху',
  slug: 'ari-mardan',
};

describe('LibraryAdminController — линия (права)', () => {
  const routes: Array<[string, RequestMethod, string]> = [
    ['setCategoryLineage', RequestMethod.PATCH, 'categories/:id/lineage'],
    ['applyAuthorLineage', RequestMethod.POST, 'categories/:id/lineage/apply'],
    ['setEntryLineage', RequestMethod.PATCH, 'entries/:id/lineage'],
  ];

  it.each(routes)('%s висит на library/admin/%s', (name, method, path) => {
    expect(Reflect.getMetadata(PATH_METADATA, LibraryAdminController)).toBe(
      'library/admin',
    );
    const handler = Object.getOwnPropertyDescriptor(
      LibraryAdminController.prototype,
      name,
    )?.value as object;
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
  });

  function controller() {
    const service = {
      setCategoryLineage: jest.fn().mockResolvedValue({}),
      applyAuthorLineage: jest.fn().mockResolvedValue({}),
      setEntryLineage: jest.fn().mockResolvedValue({}),
    };
    return {
      service,
      controller: new LibraryAdminController(service as never),
    };
  }

  it.each([member, musicAdmin])(
    'участнику и админу чужого сервиса — 403, в сервис не ходит',
    (user) => {
      const { service, controller: c } = controller();
      const body = { lineage: 'iskcon' } as never;

      expect(() => c.setCategoryLineage(user, 'author-1', body)).toThrow(
        ForbiddenException,
      );
      expect(() => c.applyAuthorLineage(user, 'author-1')).toThrow(
        ForbiddenException,
      );
      expect(() => c.setEntryLineage(user, 'entry-1', body)).toThrow(
        ForbiddenException,
      );
      expect(service.setCategoryLineage).not.toHaveBeenCalled();
      expect(service.applyAuthorLineage).not.toHaveBeenCalled();
      expect(service.setEntryLineage).not.toHaveBeenCalled();
    },
  );

  it.each([admin, libraryAdmin])(
    'админу портала и админу Образования — можно',
    async (user) => {
      const { service, controller: c } = controller();
      const body = { lineage: 'iskcon' } as never;

      await c.setCategoryLineage(user, 'author-1', body);
      await c.applyAuthorLineage(user, 'author-1');
      await c.setEntryLineage(user, 'entry-1', body);

      expect(service.setCategoryLineage).toHaveBeenCalledWith('author-1', body);
      expect(service.applyAuthorLineage).toHaveBeenCalledWith(
        (user as { sub: string }).sub,
        'author-1',
      );
      expect(service.setEntryLineage).toHaveBeenCalledWith('entry-1', body);
    },
  );
});

describe('LibraryAdminService.setCategoryLineage', () => {
  it('запоминает линию у рубрики и не трогает материалы', async () => {
    const { service, prisma } = createService(author);

    await expect(
      service.setCategoryLineage('author-1', { lineage: 'ipbys' }),
    ).resolves.toEqual({ id: 'author-1', lineage: 'ipbys' });
    expect(prisma.libraryCategory.update).toHaveBeenCalledWith({
      where: { id: 'author-1' },
      data: { lineage: 'ipbys' },
      select: { id: true, lineage: true },
    });
    expect(prisma.libraryEntry.updateMany).not.toHaveBeenCalled();
  });

  it('null снимает линию автора', async () => {
    const { service } = createService(author);

    await expect(
      service.setCategoryLineage('author-1', { lineage: null }),
    ).resolves.toEqual({ id: 'author-1', lineage: null });
  });

  it('линию вне справочника отвергает', async () => {
    const { service, prisma } = createService(author);

    await expect(
      service.setCategoryLineage('author-1', { lineage: 'hare' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.libraryCategory.update).not.toHaveBeenCalled();
  });

  it('слитую или отсутствующую рубрику — 404', async () => {
    await expect(
      createService({ ...author, status: 'merged' }).service.setCategoryLineage(
        'author-1',
        { lineage: 'iskcon' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      createService(null).service.setCategoryLineage('author-1', {
        lineage: 'iskcon',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('LibraryAdminService.applyAuthorLineage', () => {
  it('проставляет линию автора всем материалам поддерева и пишет в журнал', async () => {
    const { service, prisma, events } = createService(author);

    await expect(
      service.applyAuthorLineage('admin-1', 'author-1'),
    ).resolves.toEqual({ lineage: 'sri_chaitanya_saraswat_math', updated: 7 });

    expect(prisma.libraryCategory.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ id: 'author-1' }, { path: { contains: '.author-1.' } }],
      },
      select: { id: true },
    });
    expect(prisma.libraryEntry.updateMany).toHaveBeenCalledWith({
      where: {
        categories: {
          some: { categoryId: { in: ['author-1', 'lectures-1'] } },
        },
        OR: [
          { lineage: null },
          { lineage: { not: 'sri_chaitanya_saraswat_math' } },
        ],
      },
      data: { lineage: 'sri_chaitanya_saraswat_math' },
    });
    expect(events.emit).toHaveBeenCalledWith(
      'admin.action',
      expect.objectContaining({
        actorId: 'admin-1',
        action: 'library.author-lineage-applied',
        targetId: 'author-1',
        details: expect.objectContaining({
          author: 'Ари Мардан Прабху',
          updated: 7,
        }) as unknown,
      }),
    );
  });

  it('без выбранной линии ничего не трогает', async () => {
    const { service, prisma, events } = createService({
      ...author,
      lineage: null,
    });

    await expect(
      service.applyAuthorLineage('admin-1', 'author-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.libraryEntry.updateMany).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('отсутствующая рубрика — 404', async () => {
    const { service, prisma } = createService(null);

    await expect(
      service.applyAuthorLineage('admin-1', 'author-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.libraryEntry.updateMany).not.toHaveBeenCalled();
  });
});

describe('LibraryAdminService.setEntryLineage', () => {
  it('меняет линию одного материала', async () => {
    const { service, prisma } = createService(author);

    await expect(
      service.setEntryLineage('entry-1', { lineage: 'advaita_vamsha' }),
    ).resolves.toEqual({ id: 'entry-1', lineage: 'advaita_vamsha' });
    expect(prisma.libraryEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { lineage: 'advaita_vamsha' },
      select: { id: true, lineage: true },
    });
  });

  it('null — «для всех линий»', async () => {
    const { service } = createService(author);

    await expect(
      service.setEntryLineage('entry-1', { lineage: null }),
    ).resolves.toEqual({ id: 'entry-1', lineage: null });
  });

  it('мусор — 400, отсутствующий материал — 404', async () => {
    const { service, prisma } = createService(author);

    await expect(
      service.setEntryLineage('entry-1', { lineage: 'all' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.libraryEntry.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.setEntryLineage('entry-1', { lineage: 'iskcon' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.libraryEntry.update).not.toHaveBeenCalled();
  });
});
