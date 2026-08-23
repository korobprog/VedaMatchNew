import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LibrarySectionRequestsService } from './library-section-requests.service';

const NOW = new Date('2026-08-23T10:00:00.000Z');

function requestRow(over: Record<string, unknown> = {}) {
  return {
    id: 'request-1',
    titleRu: 'Служение и сева',
    titleEn: 'Service and seva',
    reason: 'Материалов про служение много, а полки для них нет',
    status: 'pending',
    decision: null,
    decidedAt: null,
    createdAt: NOW,
    requestedById: 'user-1',
    requestedBy: { name: 'Кешава' },
    ...over,
  };
}

function prismaMock(over: Record<string, unknown> = {}) {
  return {
    librarySectionRequest: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue(requestRow()),
      findMany: jest.fn().mockResolvedValue([requestRow()]),
      findUnique: jest.fn().mockResolvedValue(requestRow()),
      update: jest.fn().mockResolvedValue(requestRow({ status: 'approved' })),
      ...(over.librarySectionRequest ?? {}),
    },
  };
}

function sectionsMock() {
  return {
    create: jest
      .fn()
      .mockResolvedValue({ id: 'section-9', slug: 'service-and-seva' }),
  };
}

function busMock() {
  return { emit: jest.fn() };
}

describe('LibrarySectionRequestsService.create', () => {
  const validBody = {
    titleRu: 'Служение',
    titleEn: 'Service',
    reason: 'нет подходящей полки',
  };

  it('требует оба названия', async () => {
    const service = new LibrarySectionRequestsService(
      prismaMock() as never,
      sectionsMock() as never,
      busMock() as never,
    );

    await expect(
      service.create('user-1', { ...validBody, titleEn: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('не даёт копить открытые заявки без счёта', async () => {
    const prisma = prismaMock();
    prisma.librarySectionRequest.count.mockResolvedValue(5);
    const service = new LibrarySectionRequestsService(
      prisma as never,
      sectionsMock() as never,
      busMock() as never,
    );

    await expect(service.create('user-1', validBody)).rejects.toThrow(
      'too_many_open_requests',
    );
  });

  it('сохраняет заявку за автором', async () => {
    const prisma = prismaMock();
    const service = new LibrarySectionRequestsService(
      prisma as never,
      sectionsMock() as never,
      busMock() as never,
    );

    await service.create('user-1', validBody);

    expect(prisma.librarySectionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestedById: 'user-1',
          titleRu: 'Служение',
          titleEn: 'Service',
        }),
      }),
    );
  });
});

describe('LibrarySectionRequestsService.decide', () => {
  it('не пускает не-админа', async () => {
    const service = new LibrarySectionRequestsService(
      prismaMock() as never,
      sectionsMock() as never,
      busMock() as never,
    );

    await expect(
      service.decide('user-1', false, 'request-1', { action: 'approve' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('одобрение заводит раздел и шлёт событие автору', async () => {
    const prisma = prismaMock();
    const sections = sectionsMock();
    const bus = busMock();
    const service = new LibrarySectionRequestsService(
      prisma as never,
      sections as never,
      bus as never,
    );

    await service.decide('admin-1', true, 'request-1', { action: 'approve' });

    // Раздел заводится названиями из заявки — переписывать их руками значит
    // получить раздел, не совпадающий с одобренным.
    expect(sections.create).toHaveBeenCalledWith(true, {
      titleRu: 'Служение и сева',
      titleEn: 'Service and seva',
    });
    expect(bus.emit).toHaveBeenCalledWith(
      'library.section-request.decided',
      expect.objectContaining({
        recipientId: 'user-1',
        approved: true,
        sectionSlug: 'service-and-seva',
      }),
    );
  });

  it('при отказе раздел не заводится, но автор всё равно узнаёт', async () => {
    const prisma = prismaMock();
    const sections = sectionsMock();
    const bus = busMock();
    const service = new LibrarySectionRequestsService(
      prisma as never,
      sections as never,
      bus as never,
    );

    await service.decide('admin-1', true, 'request-1', {
      action: 'reject',
      comment: 'Уже есть «Практика и садхана»',
    });

    expect(sections.create).not.toHaveBeenCalled();
    expect(bus.emit).toHaveBeenCalledWith(
      'library.section-request.decided',
      expect.objectContaining({
        approved: false,
        comment: 'Уже есть «Практика и садхана»',
      }),
    );
  });

  it('второй раз решить нельзя', async () => {
    const prisma = prismaMock();
    prisma.librarySectionRequest.findUnique.mockResolvedValue(
      requestRow({ status: 'approved' }) as never,
    );
    const service = new LibrarySectionRequestsService(
      prisma as never,
      sectionsMock() as never,
      busMock() as never,
    );

    await expect(
      service.decide('admin-1', true, 'request-1', { action: 'approve' }),
    ).rejects.toThrow('request_already_decided');
  });
});
