import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ChatColorTemplateDto,
  ChatColorTemplatesState,
  SaveChatColorTemplateRequest,
} from '@vedamatch/shared';
import {
  CHAT_COLOR_HEX_PATTERN,
  CHAT_COLOR_TEMPLATE_MAX_NAME_LENGTH,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

type TemplateRow = {
  id: string;
  name: string;
  bubbleMine: string;
  bubbleTheirs: string;
  accent: string;
  background: string;
  createdAt: Date;
  updatedAt: Date;
};

function toDto(row: TemplateRow): ChatColorTemplateDto {
  return {
    id: row.id,
    name: row.name,
    bubbleMine: row.bubbleMine,
    bubbleTheirs: row.bubbleTheirs,
    accent: row.accent,
    background: row.background,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * CRUD шаблонов цвета переписки. Шаблон существует независимо от бесед —
 * применение к конкретной беседе живёт в ChatConversationThemeService.
 */
@Injectable()
export class ChatColorTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ChatColorTemplatesState> {
    const rows = await this.prisma.chatColorTemplate.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return { templates: rows.map(toDto) };
  }

  async create(
    userId: string,
    dto: SaveChatColorTemplateRequest,
  ): Promise<ChatColorTemplateDto> {
    const clean = this.validate(dto);
    const created = await this.prisma.chatColorTemplate.create({
      data: { userId, ...clean },
    });
    return toDto(created);
  }

  async update(
    userId: string,
    id: string,
    dto: SaveChatColorTemplateRequest,
  ): Promise<ChatColorTemplateDto> {
    await this.requireOwn(userId, id);
    const clean = this.validate(dto);
    const updated = await this.prisma.chatColorTemplate.update({
      where: { id },
      data: clean,
    });
    return toDto(updated);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    await this.requireOwn(userId, id);
    await this.prisma.chatColorTemplate.delete({ where: { id } });
    return { ok: true };
  }

  private async requireOwn(userId: string, id: string): Promise<void> {
    const row = await this.prisma.chatColorTemplate.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Шаблон не найден');
  }

  private validate(
    dto: SaveChatColorTemplateRequest,
  ): SaveChatColorTemplateRequest {
    const name = dto?.name?.trim();
    if (!name) throw new BadRequestException('Не указано имя шаблона');
    if (name.length > CHAT_COLOR_TEMPLATE_MAX_NAME_LENGTH)
      throw new BadRequestException('Имя шаблона слишком длинное');

    const colors = {
      bubbleMine: dto?.bubbleMine,
      bubbleTheirs: dto?.bubbleTheirs,
      accent: dto?.accent,
      background: dto?.background,
    };
    for (const [key, value] of Object.entries(colors)) {
      if (!value || !CHAT_COLOR_HEX_PATTERN.test(value))
        throw new BadRequestException(`Некорректный цвет: ${key}`);
    }

    return { name, ...colors } as SaveChatColorTemplateRequest;
  }
}
