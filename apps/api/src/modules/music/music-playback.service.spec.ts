import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import { MusicPlaybackService } from './music-playback.service';

function prismaMock() {
  return {
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
    },
    musicPlayState: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    musicNowPlaying: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    musicListen: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'l1' }),
      update: jest.fn().mockResolvedValue({}),
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
    });
  });

  it('сохранённые отдаёт как есть', async () => {
    const prisma = prismaMock();
    prisma.musicSettings.findUnique.mockResolvedValue({
      nowPlayingVisibility: 'nobody',
      autoplay: false,
    });

    expect(await service(prisma).getSettings('u1')).toEqual({
      nowPlayingVisibility: 'nobody',
      autoplay: false,
    });
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
