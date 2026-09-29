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

  const user = (avatarUrl: string | null, name = 'Нитай') => ({
    user: { avatarUrl, name, spiritualName: null, homeLocation: null },
  });

  function setup(rows: ReturnType<typeof user>[], slots: unknown[] = []) {
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

  it('отдаёт эфир, фото и первые имена слушателей', async () => {
    const { service } = setup([
      user('https://a/1.jpg', 'Нитай Чаран дас'),
      user(null, 'Радха'),
      user('https://a/2.jpg', 'Гопал'),
    ]);

    const result = await service.publicState(new Date(state.serverTime));

    expect(result).toEqual({
      ...state,
      listenerAvatars: ['https://a/1.jpg', 'https://a/2.jpg'],
      listenerNames: ['Нитай', 'Радха'],
      listenerCities: 0,
      recent: [],
    });
  });

  it('берёт только живых слушателей, кто не скрыл себя, без агента и заблокированных', async () => {
    const { service, findMany } = setup([]);
    const now = new Date(state.serverTime);

    await service.publicState(now);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          lastSeenAt: { gt: new Date(now.getTime() - 60_000) },
          user: {
            deletedAt: null,
            accountStatus: 'active',
            isAgent: false,
            NOT: {
              musicSettings: {
                is: {
                  OR: [
                    { radioPublicPresence: false },
                    { nowPlayingVisibility: 'nobody' },
                  ],
                },
              },
            },
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

/* VED-661: «Поделиться» ведёт на публичное радио с этой записью. */
describe('MusicRadioService.sharedTrack', () => {
  function setup(row: unknown) {
    const findFirst = jest.fn().mockResolvedValue(row);
    const presignGet = jest.fn().mockResolvedValue('https://s/signed.mp3');
    const service = new MusicRadioService(
      { musicTrack: { findFirst } } as unknown as PrismaService,
      { presignGet } as unknown as MusicStorageService,
      {} as MusicMetadataReader,
      new ConfigService({}),
    );
    return { service, findFirst };
  }

  it('отдаёт опубликованную запись каталога со ссылкой на звук', async () => {
    const { service, findFirst } = setup({
      id: 't1',
      title: 'Maha Mantra',
      storageKey: 'music/t1.mp3',
      coverKey: null,
      durationSeconds: 120,
      language: null,
      isLiveRecording: false,
      lineage: null,
      playCount: 0,
      publishedAt: null,
      artist: null,
      album: null,
      categories: [],
    });

    const result = await service.sharedTrack('t1');

    expect(result.track.title).toBe('Maha Mantra');
    expect(result.streamUrl).toBe('https://s/signed.mp3');
    const [query] = findFirst.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(query.where).toMatchObject({ id: 't1', status: 'published' });
  });

  it('нет такой опубликованной — 404', async () => {
    const { service } = setup(null);
    await expect(service.sharedTrack('nope')).rejects.toThrow(
      'Запись не найдена',
    );
  });
});
