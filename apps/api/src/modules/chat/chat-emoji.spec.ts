import { CHAT_DEFAULT_FAVORITE_EMOJIS } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeFavoriteEmojis } from './chat-emoji';
import { ChatEmojiService } from './chat-emoji.service';
import { ChatValidationError } from './chat-validate';

describe('normalizeFavoriteEmojis (VED-123)', () => {
  it('принимает смайлики, в том числе составные и флаги', () => {
    expect(normalizeFavoriteEmojis(['🙏', '🕉️', '👨‍👩‍👧', '🇮🇳'])).toEqual([
      '🙏',
      '🕉️',
      '👨‍👩‍👧',
      '🇮🇳',
    ]);
  });

  it('срезает пробелы и убирает повторы, сохраняя порядок', () => {
    expect(normalizeFavoriteEmojis([' ❤️ ', '🙏', '❤️'])).toEqual(['❤️', '🙏']);
  });

  it('текст и несколько смайликов в одном элементе не пропускает', () => {
    expect(() => normalizeFavoriteEmojis(['ок'])).toThrow(ChatValidationError);
    expect(() => normalizeFavoriteEmojis(['🙏🙏'])).toThrow(
      ChatValidationError,
    );
    expect(() => normalizeFavoriteEmojis([''])).toThrow(ChatValidationError);
    expect(() => normalizeFavoriteEmojis([42])).toThrow(ChatValidationError);
  });

  it('не список — ошибка', () => {
    expect(() => normalizeFavoriteEmojis('🙏')).toThrow(ChatValidationError);
  });

  it('больше тридцати двух — ошибка', () => {
    const many = [
      ...'😀😁😂🤣😃😄😅😆😉😊😋😎😍😘🥰😗😙🥲😚🙂🤗🤩🤔🫡🤨😐😑😶🫥🙄😏😣😥',
    ];
    expect(many.length).toBeGreaterThan(32);
    expect(() => normalizeFavoriteEmojis(many)).toThrow(ChatValidationError);
  });

  it('пустой список — допустим: это возврат к встроенному набору', () => {
    expect(normalizeFavoriteEmojis([])).toEqual([]);
  });
});

describe('ChatEmojiService', () => {
  const prisma = {
    chatSettings: { findUnique: jest.fn(), upsert: jest.fn() },
  };
  const service = new ChatEmojiService(prisma as unknown as PrismaService);

  beforeEach(() => jest.resetAllMocks());

  it('без настройки отдаёт встроенный набор', async () => {
    prisma.chatSettings.findUnique.mockResolvedValue(null);
    await expect(service.favorites()).resolves.toEqual({
      emojis: [...CHAT_DEFAULT_FAVORITE_EMOJIS],
      isBuiltIn: true,
    });
  });

  it('отдаёт набор администрации, когда он задан', async () => {
    prisma.chatSettings.findUnique.mockResolvedValue({
      favoriteEmojis: ['🙏', '🌸'],
    });
    await expect(service.favorites()).resolves.toEqual({
      emojis: ['🙏', '🌸'],
      isBuiltIn: false,
    });
  });

  it('сохраняет очищенный набор', async () => {
    prisma.chatSettings.upsert.mockResolvedValue({});
    prisma.chatSettings.findUnique.mockResolvedValue({
      favoriteEmojis: ['🙏'],
    });

    await service.updateFavorites({ emojis: [' 🙏 ', '🙏'] });

    expect(prisma.chatSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { id: 'global', favoriteEmojis: ['🙏'] },
        update: { favoriteEmojis: ['🙏'] },
      }),
    );
  });

  it('неверный набор отбивает четырёхсотой и ничего не пишет', async () => {
    await expect(
      service.updateFavorites({ emojis: ['не смайлик'] }),
    ).rejects.toThrow('не один смайлик');
    expect(prisma.chatSettings.upsert).not.toHaveBeenCalled();
  });
});
