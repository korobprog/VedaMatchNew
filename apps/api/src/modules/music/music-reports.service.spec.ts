import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import { MusicReportsService } from './music-reports.service';

/** Шина: проверяем, что факт уходит, а формулировку строит подписчик. */
const шина = () => ({ emit: jest.fn() });

function prismaMock() {
  return {
    musicTrack: {
      findUnique: jest.fn().mockResolvedValue({
        id: 't1',
        status: 'published',
        title: 'Гаура-арати',
        uploadedById: 'автор',
      }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    musicReport: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue({
        id: 'r1',
        status: 'open',
        trackId: 't1',
      }),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'r1' }),
      count: jest.fn().mockResolvedValue(1),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
}

const service = (
  p: ReturnType<typeof prismaMock>,
  events: ReturnType<typeof шина> = шина(),
) =>
  new MusicReportsService(
    p as unknown as PrismaService,
    events as unknown as EventEmitter2,
  );

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

describe('уведомления', () => {
  it('о скрытии автор узнаёт сразу', async () => {
    const prisma = prismaMock();
    const events = шина();
    prisma.musicReport.count.mockResolvedValue(3);

    await service(prisma, events).create('u1', body());

    expect(events.emit).toHaveBeenCalledWith('music.track.hidden-by-reports', {
      name: 'music.track.hidden-by-reports',
      recipientId: 'автор',
      trackId: 't1',
      title: 'Гаура-арати',
      kind: 'content',
    });
  });

  it('пока порог не перейдён — молчим', async () => {
    const prisma = prismaMock();
    const events = шина();
    prisma.musicReport.count.mockResolvedValue(1);

    await service(prisma, events).create('u1', body());

    expect(events.emit).not.toHaveBeenCalled();
  });

  it('у записи без автора уведомлять некого', async () => {
    // uploadedById — SetNull: аккаунт могли удалить, запись осталась.
    const prisma = prismaMock();
    const events = шина();
    prisma.musicTrack.findUnique.mockResolvedValue({
      id: 't1',
      status: 'published',
      title: 'Гаура-арати',
      uploadedById: null,
    });
    prisma.musicReport.count.mockResolvedValue(3);

    await service(prisma, events).create('u1', body());

    expect(events.emit).not.toHaveBeenCalled();
  });

  it('о возврате через неделю автор тоже узнаёт', async () => {
    const prisma = prismaMock();
    const events = шина();
    prisma.musicTrack.findMany.mockResolvedValue([
      {
        id: 't1',
        title: 'Гаура-арати',
        uploadedById: 'автор',
        reports: [{ createdAt: new Date('2026-08-19T12:00:00.000Z') }],
      },
    ]);

    await service(prisma, events).closeOverdue(
      new Date('2026-08-27T12:00:00.000Z'),
    );

    expect(events.emit).toHaveBeenCalledWith('music.track.review-expired', {
      name: 'music.track.review-expired',
      recipientId: 'автор',
      trackId: 't1',
      title: 'Гаура-арати',
    });
  });
});

describe('MusicReportsService.list', () => {
  it('не пускает не-администратора', async () => {
    await expect(service(prismaMock()).list(false)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('берёт только открытые, старые сверху', async () => {
    const prisma = prismaMock();

    await service(prisma).list(true);

    expect(prisma.musicReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'open' },
        orderBy: { createdAt: 'asc' },
      }),
    );
  });

  // Решают по записи и тексту, а не по тому, кто пожаловался.
  it('имя жалобщика наружу не отдаёт', async () => {
    const prisma = prismaMock();
    prisma.musicReport.findMany.mockResolvedValue([
      {
        id: 'r1',
        kind: 'copyright',
        text: 'это чужая запись',
        createdAt: new Date('2026-08-20T10:00:00.000Z'),
        track: {
          id: 't1',
          title: 'Гаура-арати',
          status: 'hidden',
          artist: { name: 'Хор Минской ятры' },
        },
      },
    ]);

    const { items } = await service(prisma).list(true);

    expect(items[0]).toEqual({
      id: 'r1',
      kind: 'copyright',
      text: 'это чужая запись',
      createdAt: '2026-08-20T10:00:00.000Z',
      track: {
        id: 't1',
        title: 'Гаура-арати',
        status: 'hidden',
        artistName: 'Хор Минской ятры',
      },
      openOnTrack: 1,
    });
    expect(JSON.stringify(items)).not.toContain('reporter');
  });
});

describe('MusicReportsService.decide', () => {
  it('не пускает не-администратора', async () => {
    await expect(
      service(prismaMock()).decide(false, 'admin', 'r1', {
        decision: 'resolved',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('несуществующей жалобы нет', async () => {
    const prisma = prismaMock();
    prisma.musicReport.findUnique.mockResolvedValue(null);

    await expect(
      service(prisma).decide(true, 'admin', 'нет', { decision: 'resolved' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('дважды по одной жалобе не решают', async () => {
    const prisma = prismaMock();
    prisma.musicReport.findUnique.mockResolvedValue({
      id: 'r1',
      status: 'resolved',
      trackId: 't1',
    });

    await expect(
      service(prisma).decide(true, 'admin', 'r1', { decision: 'resolved' }),
    ).rejects.toThrow(BadRequestException);
  });

  /**
   * Жалобы на одну запись об одном и том же: закрывать их поштучно значит
   * скрывать её заново на каждой следующей.
   */
  it('закрывает все открытые жалобы на запись разом', async () => {
    const prisma = prismaMock();

    await service(prisma).decide(true, 'admin', 'r1', {
      decision: 'resolved',
    });

    expect(prisma.musicReport.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { trackId: 't1', status: 'open' },
        data: expect.objectContaining({
          status: 'resolved',
          decidedById: 'admin',
        }),
      }),
    );
  });

  it('отклонённая жалоба возвращает запись в каталог', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findUnique.mockResolvedValue({
      id: 't1',
      status: 'hidden',
    });

    await service(prisma).decide(true, 'admin', 'r1', {
      decision: 'rejected',
    });

    expect(prisma.musicTrack.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'published' }),
      }),
    );
  });

  // Жалоба не должна отменять решение администратора, снявшего запись руками.
  it('снятую руками запись отклонённая жалоба не возвращает', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findUnique.mockResolvedValue({
      id: 't1',
      status: 'rejected',
    });

    await service(prisma).decide(true, 'admin', 'r1', {
      decision: 'rejected',
    });

    expect(prisma.musicTrack.update).not.toHaveBeenCalled();
  });

  it('подтверждённая жалоба запись не возвращает', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findUnique.mockResolvedValue({
      id: 't1',
      status: 'hidden',
    });

    await service(prisma).decide(true, 'admin', 'r1', {
      decision: 'resolved',
    });

    expect(prisma.musicTrack.update).not.toHaveBeenCalled();
  });
});
