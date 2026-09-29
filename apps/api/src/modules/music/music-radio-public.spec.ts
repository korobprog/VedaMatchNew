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

  function setup(
    rows: { user: { avatarUrl: string | null } }[],
    slots: unknown[] = [],
  ) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const slotsFindMany = jest.fn().mockResolvedValue(slots);
    const prisma = {
      musicRadioListener: { findMany },
      musicRadioSlot: { findMany: slotsFindMany },
    } as unknown as PrismaService;
    const service = new MusicRadioService(
      prisma,
      {} as MusicStorageService,
      {} as MusicMetadataReader,
      new ConfigService({}),
    );
    jest.spyOn(service, 'state').mockResolvedValue(state);
    return { service, findMany, slotsFindMany };
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
      recent: [],
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

  it('«Недавно в эфире» — без играющей записи и без вставок, не больше трёх', async () => {
    const at = (min: number) => new Date(Date.UTC(2026, 8, 29, 9, min));
    const track = (id: string) => ({
      id,
      title: `Запись ${id}`,
      artist: { name: 'Хор' },
    });
    const { service } = setup(
      [],
      [
        { id: 'slot-now', startsAt: at(58), track: track('t0') },
        { id: 'slot-3', startsAt: at(50), track: track('t3') },
        { id: 'slot-ins', startsAt: at(48), track: null },
        { id: 'slot-2', startsAt: at(40), track: track('t2') },
      ],
    );
    jest.spyOn(service, 'state').mockResolvedValue({
      ...state,
      current: { slotId: 'slot-now' } as MusicRadioStateDto['current'],
    });

    const result = await service.publicState(new Date(state.serverTime));

    expect(result.recent).toEqual([
      {
        slotId: 'slot-3',
        startsAt: at(50).toISOString(),
        trackId: 't3',
        title: 'Запись t3',
        artistName: 'Хор',
      },
      {
        slotId: 'slot-2',
        startsAt: at(40).toISOString(),
        trackId: 't2',
        title: 'Запись t2',
        artistName: 'Хор',
      },
    ]);
  });
});
