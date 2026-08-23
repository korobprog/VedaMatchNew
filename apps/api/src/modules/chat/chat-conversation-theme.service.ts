import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ChatConversationThemeState } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Какой шаблон цвета применён к беседе у конкретного пользователя.
 * Приватно: строка привязана к userId, соседи по беседе её не видят.
 */
@Injectable()
export class ChatConversationThemeService {
  constructor(private readonly prisma: PrismaService) {}

  async get(
    userId: string,
    conversationId: string,
  ): Promise<ChatConversationThemeState> {
    const row = await this.prisma.chatConversationTheme.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
      select: { templateId: true },
    });
    return { templateId: row?.templateId ?? null };
  }

  async set(
    userId: string,
    conversationId: string,
    templateId: string | null,
  ): Promise<ChatConversationThemeState> {
    await this.assertMember(userId, conversationId);
    if (templateId) await this.assertOwnTemplate(userId, templateId);

    await this.prisma.chatConversationTheme.upsert({
      where: { userId_conversationId: { userId, conversationId } },
      create: { userId, conversationId, templateId },
      update: { templateId },
    });
    return { templateId };
  }

  private async assertMember(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const member = await this.prisma.chatMember.findFirst({
      where: { conversationId, userId },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Беседа не найдена');
  }

  private async assertOwnTemplate(
    userId: string,
    templateId: string,
  ): Promise<void> {
    const template = await this.prisma.chatColorTemplate.findFirst({
      where: { id: templateId, userId },
      select: { id: true },
    });
    if (!template) throw new BadRequestException('Шаблон не найден');
  }
}
