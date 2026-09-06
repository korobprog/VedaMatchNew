import { BadRequestException } from '@nestjs/common';
import { AstroTransitPreferenceService } from './astro-transit-preference.service';

function prismaMock() {
  return {
    astroTransitPreference: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ pushHour: 7 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        timeZone: 'Asia/Vladivostok',
        timeZoneLocked: false,
      }),
    },
  };
}

describe('AstroTransitPreferenceService', () => {
  it('без строки отдаёт девять утра и пояс из профиля', async () => {
    const service = new AstroTransitPreferenceService(prismaMock() as never);
    await expect(service.get('u1')).resolves.toEqual({
      pushHour: 9,
      timeZone: 'Asia/Vladivostok',
      timeZoneLocked: false,
    });
  });

  it('сохраняет час и отдаёт итог', async () => {
    const prisma = prismaMock();
    prisma.astroTransitPreference.findUnique.mockResolvedValue({ pushHour: 7 });
    const service = new AstroTransitPreferenceService(prisma as never);

    const result = await service.update('u1', { pushHour: 7 });

    expect(prisma.astroTransitPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      create: { userId: 'u1', pushHour: 7 },
      update: { pushHour: 7 },
    });
    expect(result.pushHour).toBe(7);
  });

  it.each([-1, 24, 7.5, 'x'])('отвергает час %p', async (hour) => {
    const service = new AstroTransitPreferenceService(prismaMock() as never);
    await expect(
      service.update('u1', { pushHour: hour as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
