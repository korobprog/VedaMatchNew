import { PersonalDataService } from '../personal-data/personal-data.service';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AstroBirthDataService } from './astro-birth-data.service';

const MOSCOW = {
  label: 'Москва, Россия',
  latitude: 55.7558,
  longitude: 37.6173,
};

const storedRow = {
  bornAtUtc: new Date('1987-05-12T02:20:00.000Z'),
  birthDateLocal: new Date('1987-05-12T00:00:00.000Z'),
  birthTimeLocal: '06:20',
  timeAccuracy: 'exact' as const,
  placeLabel: MOSCOW.label,
  latitude: MOSCOW.latitude,
  longitude: MOSCOW.longitude,
  timezone: 'Europe/Moscow',
};

describe('AstroBirthDataService', () => {
  const prisma = {
    astroBirthData: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };
  const service = new AstroBirthDataService(
    prisma as unknown as PrismaService,
    { emit: jest.fn() } as never,
    // Контур выключен: сервис прозрачен и сразу зовёт основную запись.
    new PersonalDataService(prisma as never, { isEnabled: false } as never),
  );

  /** Данные, ушедшие в БД при последнем upsert. */
  const written = () => {
    const calls = prisma.astroBirthData.upsert.mock.calls as Array<
      [
        {
          update: {
            bornAtUtc: Date;
            birthDateLocal: Date;
            birthTimeLocal: string | null;
            timeAccuracy: string;
            timezone: string;
          };
        },
      ]
    >;
    return calls[0][0].update;
  };

  beforeEach(() => jest.resetAllMocks());

  describe('state', () => {
    it('без данных рождения отдаёт пустое состояние и нулевой прогресс', async () => {
      prisma.astroBirthData.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ birthDate: null });

      const state = await service.state('user-1');

      expect(state.birthData).toBeNull();
      expect(state.suggestedBirthDate).toBeNull();
      expect(state.completeness.percent).toBe(0);
    });

    it('подставляет дату рождения из портального профиля и засчитывает её в прогресс', async () => {
      prisma.astroBirthData.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({
        birthDate: new Date('1987-05-12T00:00:00.000Z'),
      });

      const state = await service.state('user-1');

      expect(state.suggestedBirthDate).toBe('1987-05-12');
      // Человек приходит на частично заполненный экран, а не на пустой.
      expect(state.completeness.percent).toBeGreaterThan(0);
      expect(state.completeness.next).not.toBe('birthDate');
    });

    it('пересчитывает смещение при чтении, а не берёт запомненное', async () => {
      prisma.astroBirthData.findUnique.mockResolvedValue(storedRow);
      prisma.user.findUnique.mockResolvedValue({ birthDate: null });

      const state = await service.state('user-1');

      expect(state.birthData).toMatchObject({
        birthDate: '1987-05-12',
        birthTime: '06:20',
        timezone: 'Europe/Moscow',
        // Декретное время плюс летнее.
        utcOffsetMinutes: 240,
        nonexistentLocalTime: false,
      });
      expect(state.completeness.percent).toBe(100);
    });

    it('неизвестное время не засчитывается в прогресс и не открывает лагну', async () => {
      prisma.astroBirthData.findUnique.mockResolvedValue({
        ...storedRow,
        birthTimeLocal: null,
        timeAccuracy: 'unknown' as const,
      });
      prisma.user.findUnique.mockResolvedValue({ birthDate: null });

      const state = await service.state('user-1');
      const lagna = state.completeness.features.find((f) => f.key === 'lagna')!;

      expect(state.completeness.percent).toBe(50);
      expect(lagna.unlocked).toBe(false);
      expect(lagna.requires).toEqual(['birthTime']);
    });
  });

  describe('save', () => {
    const validRequest = {
      birthDate: '1987-05-12',
      birthTime: '06:20',
      timeAccuracy: 'exact' as const,
      place: MOSCOW,
    };

    it('сохраняет момент в UTC и определённый по координатам пояс', async () => {
      prisma.astroBirthData.upsert.mockResolvedValue(storedRow);
      prisma.user.findUnique.mockResolvedValue({ birthDate: null });

      await service.save('user-1', validRequest);

      expect(written().timezone).toBe('Europe/Moscow');
      expect(written().bornAtUtc.toISOString()).toBe(
        '1987-05-12T02:20:00.000Z',
      );
    });

    it('хранит локальную дату как календарный день, а не как производную от UTC', async () => {
      prisma.astroBirthData.upsert.mockResolvedValue(storedRow);
      prisma.user.findUnique.mockResolvedValue({ birthDate: null });

      // Ночное рождение в Мумбаи приходится на предыдущие сутки по UTC:
      // обратный пересчёт даты из bornAtUtc сдвинул бы день рождения на день назад.
      await service.save('user-1', {
        birthDate: '1994-11-03',
        birthTime: '01:15',
        timeAccuracy: 'exact',
        place: { label: 'Мумбаи', latitude: 19.076, longitude: 72.8777 },
      });

      expect(written().bornAtUtc.toISOString()).toBe(
        '1994-11-02T19:45:00.000Z',
      );
      expect(written().birthDateLocal.toISOString().slice(0, 10)).toBe(
        '1994-11-03',
      );
    });

    it('при неизвестном времени не сохраняет введённое время', async () => {
      prisma.astroBirthData.upsert.mockResolvedValue(storedRow);
      prisma.user.findUnique.mockResolvedValue({ birthDate: null });

      await service.save('user-1', {
        ...validRequest,
        birthTime: '23:45',
        timeAccuracy: 'unknown',
      });

      expect(written().birthTimeLocal).toBeNull();
      expect(written().timeAccuracy).toBe('unknown');
    });

    it('отклоняет пустое место рождения', async () => {
      await expect(
        service.save('user-1', {
          ...validRequest,
          place: { ...MOSCOW, label: '   ' },
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.astroBirthData.upsert).not.toHaveBeenCalled();
    });

    it('отклоняет неизвестную точность времени', async () => {
      await expect(
        service.save('user-1', {
          ...validRequest,
          timeAccuracy: 'maybe' as never,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.astroBirthData.upsert).not.toHaveBeenCalled();
    });

    it('принимает ручное переопределение часового пояса', async () => {
      prisma.astroBirthData.upsert.mockResolvedValue(storedRow);
      prisma.user.findUnique.mockResolvedValue({ birthDate: null });

      await service.save('user-1', {
        ...validRequest,
        timezone: 'Europe/Kyiv',
      });

      expect(written().timezone).toBe('Europe/Kyiv');
    });
  });
});
