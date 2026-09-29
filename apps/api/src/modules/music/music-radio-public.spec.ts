import { ConfigService } from '@nestjs/config';
import type { MusicRadioStateDto } from '@vedamatch/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MusicMetadataReader } from './music-metadata-reader';
import { MusicRadioService } from './music-radio.service';
import type { MusicStorageService } from './music-storage.service';

/* VED-645: публичная страница радио — аватарки слушателей, «нас много». */
describe('MusicRadioService.publicState', () => {
  const state: MusicRadioStateDto = {
    serverTime: '2026-09-29T10:00:00.000Z',
    current: null,
    next: null,
    listeners: 12,
  };

  function setup(rows: { user: { avatarUrl: string | null } }[]) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma = {
      musicRadioListener: { findMany },
    } as unknown as PrismaService;
    const service = new MusicRadioService(
      prisma,
      {} as MusicStorageService,
      {} as MusicMetadataReader,
      new ConfigService({}),
    );
    jest.spyOn(service, 'state').mockResolvedValue(state);
    return { service, findMany };
  }

  it('отдаёт эфир и фото слушателей без имён', async () => {
    const { service } = setup([
      { user: { avatarUrl: 'https://a/1.jpg' } },
      { user: { avatarUrl: null } },
      { user: { avatarUrl: 'https://a/2.jpg' } },
    ]);

    const result = await service.publicState(new Date(state.serverTime));

    expect(result).toEqual({
      ...state,
      listenerAvatars: ['https://a/1.jpg', 'https://a/2.jpg'],
    });
  });

  it('берёт только живых слушателей с фото, без агента и заблокированных', async () => {
    const { service, findMany } = setup([]);
    const now = new Date(state.serverTime);

    await service.publicState(now);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 8,
        where: {
          lastSeenAt: { gt: new Date(now.getTime() - 60_000) },
          user: {
            avatarUrl: { not: null },
            deletedAt: null,
            accountStatus: 'active',
            isAgent: false,
          },
        },
      }),
    );
  });
});
