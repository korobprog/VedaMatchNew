import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ChatConversationThemeService } from './chat-conversation-theme.service';

function fn(impl?: (...args: never[]) => unknown): jest.Mock {
  return jest.fn(impl as never);
}

describe('ChatConversationThemeService', () => {
  const prisma = {
    chatConversationTheme: {
      findUnique: fn(() => Promise.resolve(null)),
      upsert: fn(() =>
        Promise.resolve({
          userId: 'user-1',
          conversationId: 'conv-1',
          templateId: 'tpl-1',
          updatedAt: new Date(),
        }),
      ),
    },
    chatMember: {
      findFirst: fn(() => Promise.resolve({ id: 'member-1' })),
    },
    chatColorTemplate: {
      findFirst: fn(() => Promise.resolve({ id: 'tpl-1' })),
    },
  };

  function service() {
    return new ChatConversationThemeService(prisma as never);
  }

  beforeEach(() => jest.clearAllMocks());

  it('без настройки отдаёт templateId: null', async () => {
    await expect(service().get('user-1', 'conv-1')).resolves.toEqual({
      templateId: null,
    });
  });

  it('отдаёт применённый шаблон', async () => {
    prisma.chatConversationTheme.findUnique.mockResolvedValueOnce({
      userId: 'user-1',
      conversationId: 'conv-1',
      templateId: 'tpl-1',
      updatedAt: new Date(),
    } as never);
    await expect(service().get('user-1', 'conv-1')).resolves.toEqual({
      templateId: 'tpl-1',
    });
  });

  it('не пускает настраивать чужую беседу', async () => {
    prisma.chatMember.findFirst.mockResolvedValueOnce(null as never);
    await expect(
      service().set('user-1', 'conv-1', 'tpl-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('не даёт применить чужой шаблон', async () => {
    prisma.chatColorTemplate.findFirst.mockResolvedValueOnce(null as never);
    await expect(
      service().set('user-1', 'conv-1', 'tpl-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('сбрасывает на дефолт через null', async () => {
    await service().set('user-1', 'conv-1', null);
    expect(prisma.chatColorTemplate.findFirst).not.toHaveBeenCalled();
    expect(prisma.chatConversationTheme.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_conversationId: { userId: 'user-1', conversationId: 'conv-1' },
        },
        create: expect.objectContaining({ templateId: null }),
        update: { templateId: null },
      }),
    );
  });
});
