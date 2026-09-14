import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CHAT_DEFAULT_FAVORITE_EMOJIS,
  type ChatFavoriteEmojisDto,
  type UpdateChatFavoriteEmojisRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeFavoriteEmojis } from './chat-emoji';
import { ChatValidationError } from './chat-validate';

/**
 * «Избранные» смайлики по умолчанию (VED-123). Набор задаёт администрация;
 * свой набор человек правит на устройстве, и сервер про него не знает.
 *
 * Лежит в той же строке `ChatSettings`, что и выключатель звонков: это
 * настройка сервиса, а не данные людей.
 */
@Injectable()
export class ChatEmojiService {
  constructor(private readonly prisma: PrismaService) {}

  async favorites(): Promise<ChatFavoriteEmojisDto> {
    const row = await this.prisma.chatSettings.findUnique({
      where: { id: 'global' },
      select: { favoriteEmojis: true },
    });
    const emojis = row?.favoriteEmojis ?? [];
    return emojis.length > 0
      ? { emojis, isBuiltIn: false }
      : { emojis: [...CHAT_DEFAULT_FAVORITE_EMOJIS], isBuiltIn: true };
  }

  async updateFavorites(
    body: UpdateChatFavoriteEmojisRequest,
  ): Promise<ChatFavoriteEmojisDto> {
    let emojis: string[];
    try {
      emojis = normalizeFavoriteEmojis(body?.emojis);
    } catch (error) {
      if (error instanceof ChatValidationError)
        throw new BadRequestException(error.message);
      throw error;
    }
    await this.prisma.chatSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global', favoriteEmojis: emojis },
      update: { favoriteEmojis: emojis },
    });
    return this.favorites();
  }
}
