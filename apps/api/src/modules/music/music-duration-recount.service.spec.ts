import { Readable } from 'node:stream';
import { MusicDurationRecountService } from './music-duration-recount.service';

/**
 * Стадия сверки длительности (VED-310): очередь, клейм и что пишется в
 * базу. Сам разбор файла подменён — за ним ESM-пакет, а решение по его
 * ответу проверяет `music-duration-recount.spec.ts`.
 */
function setup(
  over: {
    configured?: boolean;
    queue?: unknown[];
    claimed?: number;
    stream?: Readable | null;
    parsed?: number | null;
  } = {},
) {
  const stream = over.stream === undefined ? Readable.from(['x']) : over.stream;
  const prisma = {
    musicTrack: {
      findMany: jest.fn().mockResolvedValue(
        over.queue ?? [
          {
            id: 't1',
            storageKey: 'music/tracks/t1.mp3',
            mime: 'audio/mpeg',
            sizeBytes: 4_800_000,
            durationSeconds: 1872,
          },
        ],
      ),
      updateMany: jest.fn().mockResolvedValue({ count: over.claimed ?? 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const storage = {
    configured: over.configured ?? true,
    getStream: jest.fn().mockResolvedValue(stream),
  };
  const metadata = {
    readDuration: jest
      .fn()
      .mockResolvedValue(over.parsed === undefined ? 300.02 : over.parsed),
  };
  return {
    prisma,
    storage,
    metadata,
    stream,
    service: new MusicDurationRecountService(
      prisma as never,
      storage as never,
      metadata as never,
    ),
  };
}

const NOW = new Date('2026-09-23T10:00:00Z');

describe('MusicDurationRecountService.recountNext', () => {
  it('без хранилища ничего не отмечает сверенным', async () => {
    const { service, prisma } = setup({ configured: false });

    await expect(service.recountNext(3, NOW)).resolves.toBe(0);
    expect(prisma.musicTrack.findMany).not.toHaveBeenCalled();
    expect(prisma.musicTrack.updateMany).not.toHaveBeenCalled();
  });

  it('берёт из очереди только несверенные, старые первыми', async () => {
    const { service, prisma } = setup();

    await service.recountNext(3, NOW);

    expect(prisma.musicTrack.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { durationCheckedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 3,
      }),
    );
  });

  it('ставит точное число вместо оценки и закрывает поток', async () => {
    const { service, prisma, stream } = setup();

    await expect(service.recountNext(3, NOW)).resolves.toBe(1);

    expect(prisma.musicTrack.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', durationCheckedAt: null },
      data: { durationCheckedAt: NOW },
    });
    expect(prisma.musicTrack.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { durationSeconds: 300 },
    });
    expect(stream?.destroyed).toBe(true);
  });

  it('запись, взятую другим процессом, не читает', async () => {
    const { service, storage } = setup({ claimed: 0 });

    await service.recountNext(3, NOW);

    expect(storage.getStream).not.toHaveBeenCalled();
  });

  it('не прочиталось — число остаётся прежним', async () => {
    const { service, prisma } = setup({ parsed: null });

    await expect(service.recountNext(3, NOW)).resolves.toBe(0);
    expect(prisma.musicTrack.update).not.toHaveBeenCalled();
  });

  it('файл не открылся — запись не роняет остальных', async () => {
    const { service, prisma, metadata } = setup({ stream: null });

    await expect(service.recountNext(3, NOW)).resolves.toBe(0);
    expect(metadata.readDuration).not.toHaveBeenCalled();
    expect(prisma.musicTrack.update).not.toHaveBeenCalled();
  });
});
