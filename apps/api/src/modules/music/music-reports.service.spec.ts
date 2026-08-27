import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { MusicReportsService } from './music-reports.service';

function prismaMock() {
  return {
    musicTrack: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 't1', status: 'published' }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    musicReport: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'r1' }),
      count: jest.fn().mockResolvedValue(1),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
}

const service = (p: ReturnType<typeof prismaMock>) =>
  new MusicReportsService(p as unknown as PrismaService);

const body = (over = {}) => ({
  trackId: 't1',
  kind: 'content' as const,
  text: 'Это не киртан, а чужой концерт',
  ...over,
});

describe('MusicReportsService.create', () => {
  it('принимает жалобу', async () => {
    const prisma = prismaMock();

    const result = await service(prisma).create('u1', body());

    expect(result.accepted).toBe(true);
    expect(prisma.musicReport.create).toHaveBeenCalled();
  });

  it('повторная жалоба от того же человека веса не добавляет', async () => {
    // Иначе порог обходится в одиночку: три раза нажал — запись скрыта.
    const prisma = prismaMock();
    prisma.musicReport.findFirst.mockResolvedValue({ id: 'старая' });

    const result = await service(prisma).create('u1', body());

    expect(result.alreadyReported).toBe(true);
    expect(prisma.musicReport.create).not.toHaveBeenCalled();
  });

  it('без объяснения не принимает', async () => {
    const prisma = prismaMock();

    await expect(
      service(prisma).create('u1', body({ text: '  ' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('на несуществующую запись жаловаться нечем', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findUnique.mockResolvedValue(null);

    await expect(service(prisma).create('u1', body())).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('порог', () => {
    it('первая обычная жалоба запись не прячет', async () => {
      const prisma = prismaMock();
      prisma.musicReport.count.mockResolvedValue(1);

      const result = await service(prisma).create('u1', body());

      expect(result.hidden).toBe(false);
      expect(prisma.musicTrack.updateMany).not.toHaveBeenCalled();
    });

    it('третья — прячет', async () => {
      const prisma = prismaMock();
      prisma.musicReport.count.mockResolvedValue(3);

      const result = await service(prisma).create('u1', body());

      expect(result.hidden).toBe(true);
      expect(prisma.musicTrack.updateMany).toHaveBeenCalledWith({
        where: { id: 't1', status: 'published' },
        data: { status: 'hidden' },
      });
    });

    it('четвёртая уже не прячет — админ мог вернуть запись', async () => {
      const prisma = prismaMock();
      prisma.musicReport.count.mockResolvedValue(4);

      await service(prisma).create('u1', body());

      expect(prisma.musicTrack.updateMany).not.toHaveBeenCalled();
    });

    it('копирайт прячет с первой претензии', async () => {
      const prisma = prismaMock();
      prisma.musicReport.count.mockResolvedValue(1);

      const result = await service(prisma).create(
        'u1',
        body({ kind: 'copyright' }),
      );

      expect(result.hidden).toBe(true);
    });

    it('виды жалоб не складываются в одну кучу', async () => {
      // Три претензии о битрейте не должны скрывать запись как копирайт.
      const prisma = prismaMock();
      prisma.musicReport.count.mockResolvedValue(3);

      await service(prisma).create('u1', body({ kind: 'quality' }));

      expect(prisma.musicReport.count).toHaveBeenCalledWith({
        where: { trackId: 't1', kind: 'quality', status: 'open' },
      });
    });

    it('неопубликованную не трогает — у неё и так нет витрины', async () => {
      const prisma = prismaMock();
      prisma.musicReport.count.mockResolvedValue(3);
      prisma.musicTrack.updateMany.mockResolvedValue({ count: 0 });

      const result = await service(prisma).create('u1', body());

      expect(result.hidden).toBe(false);
    });
  });
});

describe('MusicReportsService.closeOverdue', () => {
  const now = new Date('2026-08-27T12:00:00.000Z');
  const давно = new Date('2026-08-19T12:00:00.000Z');
  const недавно = new Date('2026-08-26T12:00:00.000Z');

  it('запись без решения за неделю возвращается автору', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findMany.mockResolvedValue([
      { id: 't1', reports: [{ createdAt: давно }] },
    ]);

    expect(await service(prisma).closeOverdue(now)).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('свежую не трогает', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findMany.mockResolvedValue([
      { id: 't1', reports: [{ createdAt: недавно }] },
    ]);

    expect(await service(prisma).closeOverdue(now)).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('запись не удаляется — только возвращается', async () => {
    // Удалять чужой файл за то, что админ не подошёл, нельзя: наказан
    // оказался бы не тот, а три аккаунта стали бы кнопкой «удалить чужое».
    const prisma = prismaMock();
    prisma.musicTrack.findMany.mockResolvedValue([
      { id: 't1', reports: [{ createdAt: давно }] },
    ]);

    await service(prisma).closeOverdue(now);

    expect(prisma.musicTrack).not.toHaveProperty('delete');
    expect(prisma.musicTrack.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          moderationNote: expect.stringContaining('неделю'),
        }),
      }),
    );
  });

  it('без открытых жалоб срок не считается', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findMany.mockResolvedValue([{ id: 't1', reports: [] }]);

    expect(await service(prisma).closeOverdue(now)).toBe(0);
  });
});
