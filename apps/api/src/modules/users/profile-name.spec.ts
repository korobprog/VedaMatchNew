import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveDisplayName } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
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
  };
  let service: UsersService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.user.findUnique.mockResolvedValue(stored);
    prisma.user.update.mockResolvedValue(stored);
    service = new UsersService(
      prisma as unknown as PrismaService,
      { get: () => undefined } as unknown as ConfigService,
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

  it('не трогает имена, если их нет в запросе', async () => {
    await service.updateProfile('u1', { gender: 'male' });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { gender: 'male' } }),
    );
  });
});
