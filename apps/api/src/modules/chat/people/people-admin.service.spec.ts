import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PeopleAdminService } from './people-admin.service';
import type { PrismaService } from '../../../prisma/prisma.service';

function createService(options: { tag?: Record<string, unknown> | null } = {}) {
  const prisma = {
    contactsTag: {
      findUnique: jest.fn(() => Promise.resolve(options.tag ?? null)),
      delete: jest.fn(() => Promise.resolve({})),
      update: jest.fn(() => Promise.resolve({})),
      create: jest.fn(() => Promise.resolve({ id: 't-1' })),
      findMany: jest.fn(() => Promise.resolve([])),
      count: jest.fn(() => Promise.resolve(0)),
    },
    contactsProfile: {
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
      findUniqueOrThrow: jest.fn(() => Promise.resolve(null)),
    },
  };
  const events = { emit: jest.fn() };
  const service = new PeopleAdminService(
    prisma as unknown as PrismaService,
    events as never,
  );
  return { service, prisma, events };
}

describe('PeopleAdminService.deleteTag', () => {
  it('системный тег не удаляет: он вернётся сидом', async () => {
    const { service, prisma } = createService({
      tag: { id: 't-1', nameRu: 'Киртан', isSystem: true },
    });

    await expect(service.deleteTag('admin-1', 't-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.contactsTag.delete).not.toHaveBeenCalled();
  });

  it('заведённый руками удаляет и пишет в журнал', async () => {
    const { service, prisma, events } = createService({
      tag: { id: 't-1', nameRu: 'Верстка', isSystem: false },
    });

    await service.deleteTag('admin-1', 't-1');

    expect(prisma.contactsTag.delete).toHaveBeenCalledWith({
      where: { id: 't-1' },
    });
    expect(events.emit).toHaveBeenCalledWith('admin.action', {
      actorId: 'admin-1',
      action: 'contacts.tag-deleted',
      targetType: 'platform',
      targetId: 't-1',
      details: { title: 'Верстка' },
    });
  });

  it('несуществующий тег не находит', async () => {
    const { service } = createService({ tag: null });

    await expect(service.deleteTag('admin-1', 't-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('PeopleAdminService.hideProfile', () => {
  it('требует внятную причину', async () => {
    const { service, prisma } = createService();

    await expect(
      service.hideProfile('admin-1', 'u-1', { reason: 'спам' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.contactsProfile.updateMany).not.toHaveBeenCalled();
  });

  it('меняет статус, а не видимость: видимость выбирает человек', async () => {
    const { service, prisma, events } = createService();
    jest
      .spyOn(
        service as unknown as { profileByUserId(id: string): Promise<unknown> },
        'profileByUserId',
      )
      .mockResolvedValue({});

    await service.hideProfile('admin-1', 'u-1', {
      reason: 'коммерческий спам',
    });

    expect(prisma.contactsProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u-1' },
      data: { status: 'pending' },
    });
    expect(events.emit).toHaveBeenCalledWith('admin.action', {
      actorId: 'admin-1',
      action: 'contacts.profile-hidden',
      targetType: 'user',
      targetId: 'u-1',
      details: { reason: 'коммерческий спам' },
    });
  });

  it('несуществующую карточку не прячет', async () => {
    const { service, prisma } = createService();
    prisma.contactsProfile.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.hideProfile('admin-1', 'u-1', { reason: 'коммерческий спам' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PeopleAdminService.restoreProfile', () => {
  it('возвращает карточку в справочник', async () => {
    const { service, prisma, events } = createService();
    jest
      .spyOn(
        service as unknown as { profileByUserId(id: string): Promise<unknown> },
        'profileByUserId',
      )
      .mockResolvedValue({});

    await service.restoreProfile('admin-1', 'u-1');

    expect(prisma.contactsProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u-1' },
      data: { status: 'active' },
    });
    expect(events.emit).toHaveBeenCalledWith(
      'admin.action',
      expect.objectContaining({ action: 'contacts.profile-restored' }),
    );
  });
});
