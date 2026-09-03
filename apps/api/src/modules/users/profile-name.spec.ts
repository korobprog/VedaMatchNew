import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  collectNameWarnings,
  findNameError,
  resolveDisplayName,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PersonalDataService } from '../personal-data/personal-data.service';
import { UsersService } from './users.service';

/**
 * Имя в профиле: обычное можно исправить, духовное — добавить и убрать.
 * Наружу человек виден духовным именем, если оно заполнено.
 */
describe('resolveDisplayName', () => {
  it('духовное имя перекрывает обычное', () => {
    expect(
      resolveDisplayName({ name: 'Максим', spiritualName: 'Мадхава дас' }),
    ).toBe('Мадхава дас');
  });

  it('без духовного имени остаётся обычное', () => {
    expect(resolveDisplayName({ name: 'Максим', spiritualName: null })).toBe(
      'Максим',
    );
  });

  it('пробелы духовным именем не считаются', () => {
    expect(resolveDisplayName({ name: 'Максим', spiritualName: '   ' })).toBe(
      'Максим',
    );
  });
});

/**
 * Жёсткая проверка имени. Отказ ловит только то, что именем быть не может:
 * редкое настоящее написание отказом задевать нельзя — человеку некуда идти.
 */
describe('findNameError', () => {
  it.each(['Максим', 'Мадхава дас', 'Жанна д’Арк', 'Анна-Мария', 'Б. К.'])(
    'принимает %s',
    (name) => {
      expect(findNameError(name)).toBeNull();
    },
  );

  it('пустое имя не принимается', () => {
    expect(findNameError('   ')).toBe('Имя не может быть пустым');
  });

  it('цифры в имени не принимаются', () => {
    expect(findNameError('Максим228')).toContain('без цифр');
  });

  it('эмодзи не принимается', () => {
    expect(findNameError('Максим 🙏')).toContain('без цифр');
  });

  it('ссылка вместо имени не принимается', () => {
    expect(findNameError('https://t.me/kto-to')).toContain('не ссылка');
  });

  it('одна буква не принимается', () => {
    expect(findNameError('А')).toContain('не короче');
  });

  it('подпись берётся из аргумента', () => {
    expect(findNameError('', 'Духовное имя')).toBe(
      'Духовное имя не может быть пустым',
    );
  });
});

/**
 * Подсказки. Сохранить они не мешают: странное написание бывает настоящим,
 * и решает человек, а не портал.
 */
describe('collectNameWarnings', () => {
  it.each(['Максим', 'Мадхава дас', 'Анна-Мария'])(
    'к обычному имени %s вопросов нет',
    (name) => {
      expect(collectNameWarnings(name)).toEqual([]);
    },
  );

  it('замечает капс', () => {
    expect(collectNameWarnings('МАКСИМ')[0]).toContain('заглавными');
  });

  it('замечает имя со строчной буквы', () => {
    expect(collectNameWarnings('максим')[0]).toContain('с заглавной');
  });

  it('замечает смесь кириллицы и латиницы в слове', () => {
    expect(collectNameWarnings('Мakсим').join(' ')).toContain('смешаны');
  });

  it('замечает букву, повторённую три раза', () => {
    expect(collectNameWarnings('Аааа').join(' ')).toContain('три раза');
  });

  it('замечает слово без гласных', () => {
    expect(collectNameWarnings('Ждфкл').join(' ')).toContain('нет гласных');
  });

  it('замечает фразу вместо имени', () => {
    expect(collectNameWarnings('Мы Идём В Гости К Друзьям').join(' ')).toContain(
      'фразу',
    );
  });

  it('о том, что и так отказ, не предупреждает дважды', () => {
    expect(collectNameWarnings('Максим228')).toEqual([]);
  });
});

describe('UsersService.updateProfile — имена', () => {
  const stored = {
    id: 'u1',
    email: 'u1@example.com',
    name: 'Максим',
    spiritualName: null as string | null,
    avatarUrl: null,
    avatarKey: null,
    birthDate: null,
    gender: null,
    homeLocation: null,
    socialLinks: null,
    messengers: null,
    role: 'user',
    spiritualStage: null,
    devoteeVerificationStatus: null,
    lastSelfIdentificationAt: null,
    photoVerifiedAt: null,
    photoVerificationRequestedAt: null,
    trialEndsAt: null,
    subscriptionPaidUntil: null,
    accountStatus: 'active',
    pendingDeletionAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    // Профиль читает режим биллинга; без строки настроек — business.
    appSettings: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  let service: UsersService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.user.findUnique.mockResolvedValue(stored);
    prisma.user.update.mockResolvedValue(stored);
    prisma.appSettings.findUnique.mockResolvedValue(null);
    service = new UsersService(
      prisma as unknown as PrismaService,
      { get: () => undefined } as unknown as ConfigService,
      { emit: jest.fn() } as never,
      // Настоящий сервис контура над выключенным контуром: прозрачен, зовёт
      // амстердамскую запись сразу — тот же путь, что и в проде до включения.
      new PersonalDataService({ isEnabled: false } as never),
    );
  });

  it('сохраняет обычное имя без пробелов по краям', async () => {
    await service.updateProfile('u1', { name: '  Максим Коробков  ' });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'Максим Коробков' } }),
    );
  });

  it('пустое обычное имя не принимается', async () => {
    await expect(service.updateProfile('u1', { name: '   ' })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('слишком длинное имя не принимается', async () => {
    await expect(
      service.updateProfile('u1', { name: 'а'.repeat(81) }),
    ).rejects.toThrow(BadRequestException);
  });

  it('сохраняет духовное имя', async () => {
    await service.updateProfile('u1', { spiritualName: 'Мадхава дас' });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { spiritualName: 'Мадхава дас' } }),
    );
  });

  it('пустая строка убирает духовное имя', async () => {
    await service.updateProfile('u1', { spiritualName: '  ' });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { spiritualName: null } }),
    );
  });

  it('имя с цифрами не принимается', async () => {
    await expect(
      service.updateProfile('u1', { name: 'Максим228' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('странное написание сохраняется: это подсказка, а не запрет', async () => {
    await service.updateProfile('u1', { name: 'МАКСИМ' });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'МАКСИМ' } }),
    );
  });

  it('мусор в духовном имени не принимается', async () => {
    await expect(
      service.updateProfile('u1', { spiritualName: 'https://t.me/kto-to' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('не трогает имена, если их нет в запросе', async () => {
    await service.updateProfile('u1', { gender: 'male' });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { gender: 'male' } }),
    );
  });

  // Пол обязателен: по нему работает подбор в Знакомствах. В базе колонка
  // осталась необязательной ради старых аккаунтов, но очистить её нельзя.
  it('пол нельзя убрать', async () => {
    await expect(
      service.updateProfile('u1', { gender: null }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
