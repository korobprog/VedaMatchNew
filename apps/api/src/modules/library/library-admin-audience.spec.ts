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

function createService(entry: Record<string, unknown> | null = { id: 'e-1' }) {
  const prisma = {
    libraryEntry: {
      findUnique: jest.fn().mockResolvedValue(entry),
      update: jest.fn(({ data }: { data: { audienceStages: string[] } }) =>
        Promise.resolve({ id: 'e-1', audienceStages: data.audienceStages }),
      ),
    },
  };
  const service = new LibraryAdminService(
    prisma as unknown as PrismaService,
    { emit: jest.fn() } as never,
  );
  return { service, prisma };
}

describe('LibraryAdminController — ступени (VED-575)', () => {
  it('висит на PATCH library/admin/entries/:id/audience-stages', () => {
    const handler = Object.getOwnPropertyDescriptor(
      LibraryAdminController.prototype,
      'setEntryAudienceStages',
    )?.value as object;
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'entries/:id/audience-stages',
    );
  });

  it.each([member, musicAdmin])('не админу Образования — 403', (user) => {
    const service = { setEntryAudienceStages: jest.fn() };
    const c = new LibraryAdminController(service as never);
    expect(() =>
      c.setEntryAudienceStages(user, 'e-1', { audienceStages: ['yogi'] }),
    ).toThrow(ForbiddenException);
    expect(service.setEntryAudienceStages).not.toHaveBeenCalled();
  });

  it.each([admin, libraryAdmin])('админу — можно', async (user) => {
    const service = { setEntryAudienceStages: jest.fn().mockResolvedValue({}) };
    const c = new LibraryAdminController(service as never);
    const body = { audienceStages: ['yogi' as const] };
    await c.setEntryAudienceStages(user, 'e-1', body);
    expect(service.setEntryAudienceStages).toHaveBeenCalledWith('e-1', body);
  });
});

describe('LibraryAdminService.setEntryAudienceStages', () => {
  it('сохраняет ступени без повторов и в порядке пути', async () => {
    const { service, prisma } = createService();
    const saved = await service.setEntryAudienceStages('e-1', {
      audienceStages: ['devotee', 'seeker', 'devotee'],
    });
    expect(prisma.libraryEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { audienceStages: ['seeker', 'devotee'] },
      }),
    );
    expect(saved).toEqual({ id: 'e-1', audienceStages: ['seeker', 'devotee'] });
  });

  it('пустой список — «для всех»', async () => {
    const { service } = createService();
    await expect(
      service.setEntryAudienceStages('e-1', { audienceStages: [] }),
    ).resolves.toEqual({ id: 'e-1', audienceStages: [] });
  });

  it.each([{}, { audienceStages: 'yogi' }, { audienceStages: ['guru'] }])(
    'неверная разметка — 400: %j',
    async (body) => {
      const { service, prisma } = createService();
      await expect(
        service.setEntryAudienceStages('e-1', body),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.libraryEntry.update).not.toHaveBeenCalled();
    },
  );

  it('нет материала — 404', async () => {
    const { service } = createService(null);
    await expect(
      service.setEntryAudienceStages('nope', { audienceStages: ['yogi'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
