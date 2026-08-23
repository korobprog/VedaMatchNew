import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ChatColorTemplatesService } from './chat-color-templates.service';

const createdAt = new Date('2026-08-23T10:00:00.000Z');

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    userId: 'user-1',
    name: 'Синий',
    bubbleMine: '#23F0C7',
    bubbleTheirs: '#1A1A2E',
    accent: '#5CCCCC',
    background: '#0A0614',
    createdAt,
    updatedAt: createdAt,
    ...over,
  };
}

function fn(impl?: (...args: never[]) => unknown): jest.Mock {
  return jest.fn(impl as never);
}

describe('ChatColorTemplatesService', () => {
  const prisma = {
    chatColorTemplate: {
      findMany: fn(() => Promise.resolve([row()])),
      findFirst: fn(() => Promise.resolve(row())),
      create: fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(row(args.data)),
      ),
      update: fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(row(args.data)),
      ),
      delete: fn(() => Promise.resolve(row())),
    },
  };

  const validDto = {
    name: 'Синий',
    bubbleMine: '#23F0C7',
    bubbleTheirs: '#1A1A2E',
    accent: '#5CCCCC',
    background: '#0A0614',
  };

  function service() {
    return new ChatColorTemplatesService(prisma as never);
  }

  beforeEach(() => jest.clearAllMocks());

  it('отдаёт шаблоны только текущего пользователя', async () => {
    await service().list('user-1');
    expect(prisma.chatColorTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it('создаёт шаблон с валидными цветами', async () => {
    const created = await service().create('user-1', validDto);
    expect(created.name).toBe('Синий');
    expect(prisma.chatColorTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', ...validDto }),
      }),
    );
  });

  it('отклоняет невалидный hex', async () => {
    await expect(
      service().create('user-1', { ...validDto, bubbleMine: 'cyan' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('отклоняет пустое имя', async () => {
    await expect(
      service().create('user-1', { ...validDto, name: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('не даёт редактировать чужой шаблон', async () => {
    prisma.chatColorTemplate.findFirst.mockResolvedValueOnce(null as never);
    await expect(
      service().update('user-2', 'tpl-1', validDto),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('не даёт удалить чужой шаблон', async () => {
    prisma.chatColorTemplate.findFirst.mockResolvedValueOnce(null as never);
    await expect(service().remove('user-2', 'tpl-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('удаляет свой шаблон', async () => {
    await expect(service().remove('user-1', 'tpl-1')).resolves.toEqual({
      ok: true,
    });
    expect(prisma.chatColorTemplate.delete).toHaveBeenCalledWith({
      where: { id: 'tpl-1' },
    });
  });
});
