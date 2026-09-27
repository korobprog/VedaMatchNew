import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  RequestMethod,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';

// jose — ESM-only, ts-jest его не транспилирует, а контроллер тянет его через
// AuthGuard. Тот же приём, что в music-admin-throttle.spec.ts.
jest.mock('../auth/jwt.service', () => ({ JwtSignService: class {} }));

import { MusicAdminCatalogController } from './music-admin-catalog.controller';
import { MusicAdminCatalogService } from './music-admin-catalog.service';
import { MusicCoversService } from './music-covers.service';
import { MusicStorageService } from './music-storage.service';
import type { PrismaService } from '../../prisma/prisma.service';

const admin = { sub: 'admin-1', role: 'admin' } as never;
const musicAdmin = {
  sub: 'sa-1',
  role: 'service-admin',
  adminServices: ['music'],
} as never;
const libraryAdmin = {
  sub: 'sa-2',
  role: 'service-admin',
  adminServices: ['library'],
} as never;
const member = { sub: 'user-1', role: 'user' } as never;

function build(artist: { id: string } | null = { id: 'a1' }) {
  const tx = {
    musicArtist: {
      update: jest.fn(({ data }: { data: { lineage: string | null } }) =>
        Promise.resolve({ id: 'a1', name: 'Аинду', lineage: data.lineage }),
      ),
    },
    musicTrack: {
      updateMany: jest.fn().mockResolvedValue({ count: 12 }),
    },
  };
  const prisma = {
    musicArtist: { findUnique: jest.fn().mockResolvedValue(artist) },
    musicTrack: { updateMany: jest.fn() },
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const storage = new MusicStorageService({
    get: () => undefined,
  } as unknown as ConfigService);
  const service = new MusicAdminCatalogService(
    prisma as unknown as PrismaService,
    new MusicCoversService(storage),
    storage,
  );
  const controller = new MusicAdminCatalogController(
    service,
    {} as never,
    {} as never,
  );
  return { controller, service, prisma, tx };
}

describe('Линия исполнителя (VED-566)', () => {
  describe('маршрут', () => {
    it('PATCH music/admin/catalog/artists/:id/lineage — под тем же контроллером, что соседние', () => {
      const handler: object = Reflect.get(
        MusicAdminCatalogController.prototype,
        'setArtistLineage',
      );
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
        'artists/:id/lineage',
      );
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.PATCH,
      );
      expect(
        Reflect.getMetadata(PATH_METADATA, MusicAdminCatalogController),
      ).toBe('music/admin/catalog');
      // Права и лимит — от контроллера, как у соседних маршрутов справочника.
      expect(
        new Reflector().get('admin-unlimited', MusicAdminCatalogController),
      ).toBe('music');
    });
  });

  describe('права', () => {
    it.each([
      ['участник', member],
      ['администратор другого сервиса', libraryAdmin],
    ])('%s — 403, ничего не пишется', async (_name, user) => {
      const { controller, prisma } = build();
      await expect(
        controller.setArtistLineage(user, 'a1', { lineage: 'iskcon' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['администратор портала', admin],
      ['администратор Музыки', musicAdmin],
    ])('%s — проходит', async (_name, user) => {
      const { controller } = build();
      await expect(
        controller.setArtistLineage(user, 'a1', { lineage: 'iskcon' }),
      ).resolves.toEqual({
        artist: { id: 'a1', name: 'Аинду', lineage: 'iskcon' },
        updatedTracks: 12,
      });
    });
  });

  describe('простановка', () => {
    it('сохраняет линию у исполнителя и всем его записям — в одной транзакции', async () => {
      const { service, prisma, tx } = build();

      const result = await service.setArtistLineage(true, 'a1', {
        lineage: 'sri_chaitanya_saraswat_math',
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.musicArtist.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'a1' },
          data: { lineage: 'sri_chaitanya_saraswat_math' },
        }),
      );
      // Одним запросом и по всем записям исполнителя, без фильтра статуса.
      expect(tx.musicTrack.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.musicTrack.updateMany).toHaveBeenCalledWith({
        where: { artistId: 'a1' },
        data: { lineage: 'sri_chaitanya_saraswat_math' },
      });
      // Вне транзакции записи не трогаются.
      expect(prisma.musicTrack.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual({
        artist: {
          id: 'a1',
          name: 'Аинду',
          lineage: 'sri_chaitanya_saraswat_math',
        },
        updatedTracks: 12,
      });
    });

    it('«Без линии» снимает её и у исполнителя, и у всех его записей', async () => {
      const { service, tx } = build();

      const result = await service.setArtistLineage(true, 'a1', {
        lineage: null,
      });

      expect(tx.musicArtist.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { lineage: null } }),
      );
      expect(tx.musicTrack.updateMany).toHaveBeenCalledWith({
        where: { artistId: 'a1' },
        data: { lineage: null },
      });
      expect(result.updatedTracks).toBe(12);
      expect(result.artist.lineage).toBeNull();
    });

    it('линия вне справочника — 400 до похода в базу', async () => {
      const { service, prisma } = build();
      await expect(
        service.setArtistLineage(true, 'a1', { lineage: 'matha' as never }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.musicArtist.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('исполнителя нет — 404, записи не трогаются', async () => {
      const { service, prisma } = build(null);
      await expect(
        service.setArtistLineage(true, 'nope', { lineage: 'iskcon' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
