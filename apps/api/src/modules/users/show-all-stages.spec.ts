import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { PersonalDataService } from '../personal-data/personal-data.service';
import { UsersService } from './users.service';

/**
 * Переключатель «Моя ступень / Все ступени» на главной (VED-575) — портальное
 * поле `User.showAllStages`: пишет `PATCH /profile`, Образование и Медиатека
 * только читают.
 */
describe('UsersService — «Все ступени» (VED-575)', () => {
  const stored = {
    id: 'u1',
    email: 'u1@example.com',
    name: 'Максим',
    spiritualName: null,
    avatarUrl: null,
    avatarKey: null,
    birthDate: null,
    gender: null,
    homeLocation: null,
    socialLinks: null,
    messengers: null,
    role: 'user',
    spiritualStage: 'seeker',
    devoteeVerificationStatus: null,
    lastSelfIdentificationAt: null,
    photoVerifiedAt: null,
    photoVerificationRequestedAt: null,
    trialEndsAt: null,
    subscriptionPaidUntil: null,
    accountStatus: 'active',
    pendingDeletionAt: null,
    showAllStages: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    appSettings: { findUnique: jest.fn() },
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
      new PersonalDataService(
        prisma as unknown as PrismaService,
        { isEnabled: false } as never,
      ),
    );
  });

  it('сохраняет выбор и отдаёт его в профиле', async () => {
    const profile = await service.updateProfile('u1', { showAllStages: true });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { showAllStages: true } }),
    );
    expect(profile.showAllStages).toBe(true);
  });

  it('всё, кроме true, — «моя ступень»', async () => {
    await service.updateProfile('u1', {
      showAllStages: 'yes' as unknown as boolean,
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { showAllStages: false } }),
    );
  });

  it('без поля переключатель не трогает', async () => {
    await service.updateProfile('u1', { statusLine: 'в пути' });

    const [[{ data }]] = prisma.user.update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(data).not.toHaveProperty('showAllStages');
  });
});
