import { BadRequestException } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import { MusicPlaybackService } from './music-playback.service';

function prismaMock() {
  return {
    // `$transaction` списком: сервис пишет строку истории и очко записи
    // вместе, чтобы счётчик и история не разъезжались.
    $transaction: jest
      .fn()
      .mockImplementation((ops: unknown[]) => Promise.all(ops)),
    musicTrack: {
      findUnique: jest.fn().mockResolvedValue({
        id: 't1',
        title: 'Шри Гуру-вандана',
        coverKey: null,
        artist: { name: 'Аударья Дхама дас' },
        durationSeconds: 200,
        status: 'published',
        uploadedById: null,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    musicPlayState: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    musicNowPlaying: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    musicListen: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'l1' }),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { seconds: null } }),
    },
    musicSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(({ create }) => create),
    },
  };
}

const config = { get: jest.fn(() => undefined) } as unknown as ConfigService;

function busMock() {
  return { emit: jest.fn() };
}

const service = (
  p: ReturnType<typeof prismaMock>,
  bus: ReturnType<typeof busMock> = busMock(),
) =>
  new MusicPlaybackService(
    p as unknown as PrismaService,
    bus as unknown as EventEmitter2,
    config,
  );

const beat = (over = {}) => ({
  trackId: 't1',
  positionSeconds: 42,
  listenedSeconds: 30,
  isPrivateSession: false,
  ...over,
});

describe('MusicPlaybackService.heartbeat', () => {
  it('сохраняет позицию по паре человек-запись', async () => {
    const prisma = prismaMock();

    await service(prisma).heartbeat('u1', beat());

    expect(prisma.musicPlayState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_trackId: { userId: 'u1', trackId: 't1' } },
      }),
    );
  });

  it('позицию зажимает длительностью — клиент присылает что угодно', async () => {
    const prisma = prismaMock();

    await service(prisma).heartbeat('u1', beat({ positionSeconds: -5 }));
    expect(
      prisma.musicPlayState.upsert.mock.calls[0][0].create.positionSeconds,
    ).toBe(0);

    await service(prisma).heartbeat('u1', beat({ positionSeconds: 99999 }));
    expect(
      prisma.musicPlayState.upsert.mock.calls[1][0].create.positionSeconds,
    ).toBe(200);
  });

  it('невидимый сеанс отмечается в строке, а не прячет её', async () => {
    // Строка нужна: по ней плеер узнаёт, что человек ещё слушает. Прячет её
    // от чужих глаз проверка видимости, а не отсутствие записи.
    const prisma = prismaMock();

    await service(prisma).heartbeat('u1', beat({ isPrivateSession: true }));

    expect(prisma.musicNowPlaying.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ isPrivateSession: true }),
      }),
    );
  });

  it('одна строка «слушает сейчас» на человека', async () => {
    const prisma = prismaMock();

    await service(prisma).heartbeat('u1', beat());

    expect(prisma.musicNowPlaying.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
  });

  describe('история прослушиваний', () => {
    it('короткое прослушивание строку не заводит', async () => {
      const prisma = prismaMock();

      await service(prisma).heartbeat('u1', beat({ listenedSeconds: 10 }));

      expect(prisma.musicListen.create).not.toHaveBeenCalled();
    });

    it('после тридцати секунд заводит одну строку', async () => {
      const prisma = prismaMock();

      await service(prisma).heartbeat('u1', beat({ listenedSeconds: 35 }));

      expect(prisma.musicListen.create).toHaveBeenCalledTimes(1);
    });

    it('дальше обновляет ту же строку, а не плодит новые', async () => {
      const prisma = prismaMock();
      prisma.musicListen.findFirst.mockResolvedValue({ id: 'l1', seconds: 35 });

      await service(prisma).heartbeat('u1', beat({ listenedSeconds: 35 }));

      expect(prisma.musicListen.create).not.toHaveBeenCalled();
      expect(prisma.musicListen.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'l1' }, data: { seconds: 70 } }),
      );
    });
  });

  describe('счётчик прослушиваний', () => {
    it('одно прослушивание — одно очко', async () => {
      const prisma = prismaMock();

      await service(prisma).heartbeat('u1', beat({ listenedSeconds: 35 }));

      expect(prisma.musicTrack.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { playCount: { increment: 1 } },
      });
    });

    // Иначе счётчик стал бы секундомером, а сортировка «популярное» —
    // сортировкой «самое длинное».
    it('следующие тики того же прослушивания очков не добавляют', async () => {
      const prisma = prismaMock();
      prisma.musicListen.findFirst.mockResolvedValue({ id: 'l1', seconds: 35 });

      await service(prisma).heartbeat('u1', beat({ listenedSeconds: 35 }));

      expect(prisma.musicTrack.update).not.toHaveBeenCalled();
    });

    it('пролистывание каталога очка не даёт', async () => {
      const prisma = prismaMock();

      await service(prisma).heartbeat('u1', beat({ listenedSeconds: 10 }));

      expect(prisma.musicTrack.update).not.toHaveBeenCalled();
    });
  });

  it('чужую неопубликованную запись слушать нельзя', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findUnique.mockResolvedValue({
      id: 't1',
      durationSeconds: 200,
      status: 'pending',
      uploadedById: 'кто-то другой',
    });

    await expect(service(prisma).heartbeat('u1', beat())).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.musicNowPlaying.upsert).not.toHaveBeenCalled();
  });

  it('свою неопубликованную — можно: до модератора её слышит автор', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findUnique.mockResolvedValue({
      id: 't1',
      durationSeconds: 200,
      status: 'pending',
      uploadedById: 'u1',
    });

    await expect(
      service(prisma).heartbeat('u1', beat()),
    ).resolves.toBeDefined();
  });

  it('несуществующей записи нет', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findUnique.mockResolvedValue(null);

    await expect(service(prisma).heartbeat('u1', beat())).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('MusicPlaybackService.stop', () => {
  it('снимает строку «слушает сейчас»', async () => {
    const prisma = prismaMock();

    await service(prisma).stop('u1');

    expect(prisma.musicNowPlaying.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
  });
});

describe('MusicPlaybackService.settings', () => {
  it('без строки отдаёт значения по умолчанию, а не пустоту', async () => {
    const prisma = prismaMock();

    expect(await service(prisma).getSettings('u1')).toEqual({
      nowPlayingVisibility: 'friends',
      autoplay: true,
      lineage: null,
    });
  });

  it('сохранённые отдаёт как есть', async () => {
    const prisma = prismaMock();
    prisma.musicSettings.findUnique.mockResolvedValue({
      nowPlayingVisibility: 'nobody',
      autoplay: false,
      lineage: 'ipbys',
    });

    expect(await service(prisma).getSettings('u1')).toEqual({
      nowPlayingVisibility: 'nobody',
      autoplay: false,
      lineage: 'ipbys',
    });
  });

  it('линию вне справочника читает как «как в профиле», а не отдаёт мусор', async () => {
    const prisma = prismaMock();
    prisma.musicSettings.findUnique.mockResolvedValue({
      nowPlayingVisibility: 'friends',
      autoplay: true,
      lineage: 'unknown-math',
    });

    expect((await service(prisma).getSettings('u1')).lineage).toBeNull();
  });

  it('линию сохраняет и принимает «all», а неизвестную отвергает', async () => {
    const prisma = prismaMock();
    prisma.musicSettings.upsert.mockResolvedValue({
      nowPlayingVisibility: 'friends',
      autoplay: true,
      lineage: 'all',
    });

    const result = await service(prisma).updateSettings('u1', {
      lineage: 'all',
    });
    expect(result.lineage).toBe('all');
    expect(prisma.musicSettings.upsert.mock.calls[0][0].update).toEqual({
      lineage: 'all',
    });

    await expect(
      service(prisma).updateSettings('u1', { lineage: 'hare' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('правит только присланное', async () => {
    const prisma = prismaMock();

    await service(prisma).updateSettings('u1', { autoplay: false });

    const call = prisma.musicSettings.upsert.mock.calls[0][0];
    expect(call.update).toEqual({ autoplay: false });
  });
});

describe('MusicPlaybackService.getState', () => {
  it('без сохранённого состояния отдаёт пустое, а не null', async () => {
    const prisma = prismaMock();

    expect(await service(prisma).getState('u1')).toEqual({
      trackId: null,
      positionSeconds: 0,
      queue: [],
      repeat: 'off',
      shuffle: false,
      updatedAt: null,
    });
  });

  it('отдаёт последнюю позицию — по ней плеер и возобновляет', async () => {
    const prisma = prismaMock();
    const updatedAt = new Date('2026-08-27T12:00:00.000Z');
    prisma.musicPlayState.findFirst.mockResolvedValue({
      trackId: 't1',
      positionSeconds: 128,
      updatedAt,
    });

    expect(await service(prisma).getState('u1')).toMatchObject({
      trackId: 't1',
      positionSeconds: 128,
      updatedAt: updatedAt.toISOString(),
    });
  });
});

describe('MusicPlaybackService — «слушает сейчас»', () => {
  it('сообщает о новой записи с названием, исполнителем и ссылками', async () => {
    const prisma = prismaMock();
    const bus = busMock();

    await service(prisma, bus).heartbeat('u1', beat());

    expect(bus.emit).toHaveBeenCalledWith(
      'music.user.now-playing',
      expect.objectContaining({
        userId: 'u1',
        nowPlaying: expect.objectContaining({
          trackId: 't1',
          title: 'Шри Гуру-вандана',
          artistName: 'Аударья Дхама дас',
          link: '/music/tracks/t1',
          addLink: '/music/tracks/t1?add=1',
        }),
      }),
    );
  });

  // Тик приходит раз в 30 секунд: рассылать одно и то же полсотни раз за
  // киртан незачем.
  it('молчит, пока играет та же запись', async () => {
    const prisma = prismaMock();
    prisma.musicNowPlaying.findUnique.mockResolvedValue({
      trackId: 't1',
      isPrivateSession: false,
    });
    const bus = busMock();

    await service(prisma, bus).heartbeat('u1', beat());

    expect(bus.emit).not.toHaveBeenCalled();
  });

  it('гасит строку, когда включён невидимый сеанс', async () => {
    const prisma = prismaMock();
    const bus = busMock();

    await service(prisma, bus).heartbeat(
      'u1',
      beat({ isPrivateSession: true }),
    );

    expect(bus.emit).toHaveBeenCalledWith(
      'music.user.now-playing',
      expect.objectContaining({ nowPlaying: null }),
    );
  });

  it('молчит, когда человек выключил видимость', async () => {
    const prisma = prismaMock();
    prisma.musicSettings.findUnique.mockResolvedValue({
      nowPlayingVisibility: 'nobody',
    });
    const bus = busMock();

    await service(prisma, bus).heartbeat('u1', beat());

    expect(bus.emit).not.toHaveBeenCalled();
  });

  it('на остановке гасит строку', async () => {
    const prisma = prismaMock();
    prisma.musicNowPlaying.deleteMany.mockResolvedValue({ count: 1 });
    const bus = busMock();

    await service(prisma, bus).stop('u1');

    expect(bus.emit).toHaveBeenCalledWith(
      'music.user.now-playing',
      expect.objectContaining({ nowPlaying: null }),
    );
  });

  // Плеер зовёт `stop` и на закрытии вкладки, где ничего не играло.
  it('не гасит то, чего не было', async () => {
    const prisma = prismaMock();
    const bus = busMock();

    await service(prisma, bus).stop('u1');

    expect(bus.emit).not.toHaveBeenCalled();
  });
});

describe('MusicPlaybackService.sweepStaleNowPlaying', () => {
  const updatedAt = new Date('2026-08-29T10:00:00.000Z');
  const row = {
    userId: 'u1',
    updatedAt,
    track: { durationSeconds: 200 },
  };

  // Вкладку убили мимо `pagehide` — heartbeat уже не придёт, и без обхода
  // человек «слушает» третьи сутки.
  it('снимает строку, по которой тик не пришёл', async () => {
    const prisma = prismaMock();
    prisma.musicNowPlaying.findMany.mockResolvedValue([row]);
    prisma.musicNowPlaying.deleteMany.mockResolvedValue({ count: 1 });
    const bus = busMock();

    const swept = await service(prisma, bus).sweepStaleNowPlaying(
      new Date('2026-08-31T10:00:00.000Z'),
    );

    expect(swept).toBe(1);
    expect(bus.emit).toHaveBeenCalledWith(
      'music.user.now-playing',
      expect.objectContaining({ userId: 'u1', nowPlaying: null }),
    );
  });

  it('живую строку не трогает', async () => {
    const prisma = prismaMock();
    prisma.musicNowPlaying.findMany.mockResolvedValue([row]);
    const bus = busMock();

    const swept = await service(prisma, bus).sweepStaleNowPlaying(
      new Date('2026-08-29T10:00:30.000Z'),
    );

    expect(swept).toBe(0);
    expect(prisma.musicNowPlaying.deleteMany).not.toHaveBeenCalled();
    expect(bus.emit).not.toHaveBeenCalled();
  });

  // Запас в две минуты поверх длительности переживает усыплённую вкладку и
  // моргнувший канал: без него человек «переставал слушать» в метро.
  it('в запасе поверх длительности строка ещё жива', async () => {
    const prisma = prismaMock();
    prisma.musicNowPlaying.findMany.mockResolvedValue([row]);

    const swept = await service(prisma).sweepStaleNowPlaying(
      // 200 секунд длительности + минута: до порога в 200 + 120 не дотянули.
      new Date(updatedAt.getTime() + 260_000),
    );

    expect(swept).toBe(0);
  });

  // Между выборкой и удалением мог прийти тик: человек снова слушает, и
  // гасить строку у друзей нечего.
  it('перехваченную тиком строку не гасит', async () => {
    const prisma = prismaMock();
    prisma.musicNowPlaying.findMany.mockResolvedValue([row]);
    prisma.musicNowPlaying.deleteMany.mockResolvedValue({ count: 0 });
    const bus = busMock();

    const swept = await service(prisma, bus).sweepStaleNowPlaying(
      new Date('2026-08-31T10:00:00.000Z'),
    );

    expect(swept).toBe(0);
    expect(bus.emit).not.toHaveBeenCalled();
  });

  it('клеймит строку по времени последнего тика', async () => {
    const prisma = prismaMock();
    prisma.musicNowPlaying.findMany.mockResolvedValue([row]);
    prisma.musicNowPlaying.deleteMany.mockResolvedValue({ count: 1 });

    await service(prisma).sweepStaleNowPlaying(
      new Date('2026-08-31T10:00:00.000Z'),
    );

    expect(prisma.musicNowPlaying.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', updatedAt },
    });
  });
});

describe('MusicPlaybackService.purgeOldListens', () => {
  it('уносит строки старше девяноста дней', async () => {
    const prisma = prismaMock();
    prisma.musicListen.findMany.mockResolvedValue([{ id: 'l1' }, { id: 'l2' }]);
    prisma.musicListen.deleteMany.mockResolvedValue({ count: 2 });

    const count = await service(prisma).purgeOldListens(
      new Date('2026-08-29T00:00:00.000Z'),
    );

    expect(count).toBe(2);
    expect(prisma.musicListen.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['l1', 'l2'] } },
    });
  });

  it('на пустом хвосте в базу за удалением не ходит', async () => {
    const prisma = prismaMock();

    expect(await service(prisma).purgeOldListens()).toBe(0);
    expect(prisma.musicListen.deleteMany).not.toHaveBeenCalled();
  });

  // Первый обход после включения ретеншена пойдёт по всему хвосту сразу.
  it('за раз берёт ограниченную пачку', async () => {
    const prisma = prismaMock();
    prisma.musicListen.findMany.mockResolvedValue([{ id: 'l1' }]);

    await service(prisma).purgeOldListens();

    expect(prisma.musicListen.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1000 }),
    );
  });
});

describe('MusicPlaybackService.getStats', () => {
  it('складывает прослушанное за неделю', async () => {
    const prisma = prismaMock();
    prisma.musicListen.aggregate.mockResolvedValue({ _sum: { seconds: 252 } });

    expect(await service(prisma).getStats('u1')).toEqual({ weekSeconds: 252 });
  });

  // Человек ничего не слушал — это ноль, а не пустота: карточке нужно число.
  it('без истории отдаёт ноль', async () => {
    const prisma = prismaMock();

    expect(await service(prisma).getStats('u1')).toEqual({ weekSeconds: 0 });
  });
});
