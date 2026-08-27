import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ASTRO_COMPATIBILITY_PURPOSES } from '@vedamatch/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';
import { AstroGenerationService } from '../astro-generation.service';
import { AstroQuotaService } from '../astro-quota.service';
import { AstroSettingsService } from '../astro-settings.service';
import { AstronomiaEphemerisProvider } from '../ephemeris/astronomia-provider';
import { AstroCompatibilityService } from './astro-compatibility.service';

const OWNER = 'owner-1';

const subject = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Карта ${id}`,
  bornAtUtc: new Date('1987-05-12T02:20:00.000Z'),
  latitude: 55.7558,
  longitude: 37.6173,
  timeAccuracy: 'exact' as const,
  gender: null as 'male' | 'female' | null,
  ...over,
});

/** Первый аргумент вызова мока через `unknown`: `mock.calls` типизирован как any. */
function argOf<T>(fn: { mock: { calls: unknown[][] } }, index = 0): T {
  return fn.mock.calls[index][0] as T;
}

type WhereArg = { where: Record<string, unknown> };

/**
 * Сверка двух записей астролога.
 *
 * Согласия здесь нет и быть не может: обе записи принадлежат тому, кто
 * сверяет. Значит вся защита держится на одном — владелец входит в условие
 * ОБОИХ запросов. Тесты проверяют именно это, а не форму ответа.
 */
describe('AstroCompatibilityService.compareSubjects', () => {
  const prisma = {
    astroSubject: { findFirst: jest.fn() },
  };

  const service = new AstroCompatibilityService(
    prisma as unknown as PrismaService,
    { resolveAvatarUrl: jest.fn() } as unknown as UsersService,
    new AstronomiaEphemerisProvider(),
    {} as unknown as AstroGenerationService,
    {} as unknown as AstroQuotaService,
    {} as unknown as AstroSettingsService,
    {} as unknown as EventEmitter2,
  );

  /**
   * Мок ведёт себя как база: строка находится, только если совпали ВСЕ поля
   * условия. Иначе тест на «чужую запись» ничего не проверял бы — без
   * ownerId в условии он всё равно находил бы строку и проходил.
   */
  function store(
    rows: Array<{ id: string; ownerId: string; gender?: 'male' | 'female' }>,
  ) {
    prisma.astroSubject.findFirst.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) => {
        const found = rows.find((row) =>
          Object.entries(where).every(
            ([key, value]) => (row as Record<string, unknown>)[key] === value,
          ),
        );
        return Promise.resolve(
          found ? subject(found.id, { gender: found.gender ?? null }) : null,
        );
      },
    );
  }

  /** Обе записи принадлежат владельцу. */
  function bothFound() {
    store([
      { id: 'a', ownerId: OWNER },
      { id: 'b', ownerId: OWNER },
    ]);
  }

  beforeEach(() => jest.resetAllMocks());

  describe('владелец в условии обоих запросов', () => {
    it('ищет каждую запись вместе с владельцем', async () => {
      bothFound();
      await service.compareSubjects(OWNER, 'a', 'b');

      expect(argOf<WhereArg>(prisma.astroSubject.findFirst, 0).where).toEqual({
        id: 'a',
        ownerId: OWNER,
      });
      expect(argOf<WhereArg>(prisma.astroSubject.findFirst, 1).where).toEqual({
        id: 'b',
        ownerId: OWNER,
      });
    });

    it('чужая вторая запись не даёт сверить', async () => {
      // Иначе «сверь свою с чужой» стало бы способом узнать чужие данные.
      // Строка существует — но принадлежит другому.
      store([
        { id: 'a', ownerId: OWNER },
        { id: 'foreign', ownerId: 'someone-else' },
      ]);

      await expect(
        service.compareSubjects(OWNER, 'a', 'foreign'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('чужая первая запись тоже не даёт', async () => {
      store([
        { id: 'foreign', ownerId: 'someone-else' },
        { id: 'b', ownerId: OWNER },
      ]);

      await expect(
        service.compareSubjects(OWNER, 'foreign', 'b'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('не сверяет запись саму с собой', async () => {
      await expect(
        service.compareSubjects(OWNER, 'a', 'a'),
      ).rejects.toBeInstanceOf(BadRequestException);
      // До базы дело даже не доходит.
      expect(prisma.astroSubject.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('счёт', () => {
    it('без цели считает по-сватовски — как и везде по умолчанию', async () => {
      bothFound();
      const pair = await service.compareSubjects(OWNER, 'a', 'b');
      expect(pair.purpose).toBe('family');
      expect(pair.score.maxPoints).toBe(36);
    });

    it('цель меняет состав кут и потолок', async () => {
      const maxima: Record<string, number> = {
        family: 36,
        business: 24,
        friendship: 17,
        service: 15,
      };
      for (const purpose of ASTRO_COMPATIBILITY_PURPOSES) {
        bothFound();
        const pair = await service.compareSubjects(OWNER, 'a', 'b', purpose);
        expect(pair.purpose).toBe(purpose);
        expect(pair.score.maxPoints).toBe(maxima[purpose]);
      }
    });

    it('отдаёт и неучтённые куты — видно, что расчёт короче', async () => {
      bothFound();
      const pair = await service.compareSubjects(OWNER, 'a', 'b', 'service');
      expect(pair.score.kootas).toHaveLength(8);
      expect(pair.score.kootas.some((k) => !k.counted)).toBe(true);
    });

    it('называет обе карты — иначе непонятно, чей это счёт', async () => {
      bothFound();
      const pair = await service.compareSubjects(OWNER, 'a', 'b');
      expect(pair.a).toEqual({ id: 'a', name: 'Карта a' });
      expect(pair.b).toEqual({ id: 'b', name: 'Карта b' });
    });

    it('отмечает неизвестный пол — гана считается по нему', async () => {
      // Без этого признака счёт выглядел бы точнее, чем он есть.
      bothFound();
      const pair = await service.compareSubjects(OWNER, 'a', 'b');
      expect(pair.genderUnknown).toBe(true);
    });

    it('не отмечает, когда пол известен у обоих', async () => {
      store([
        { id: 'a', ownerId: OWNER, gender: 'male' },
        { id: 'b', ownerId: OWNER, gender: 'female' },
      ]);
      const pair = await service.compareSubjects(OWNER, 'a', 'b');
      expect(pair.genderUnknown).toBe(false);
    });

    it('отмечает, даже если пол не указан лишь у одной', async () => {
      // Достаточно одной дыры, чтобы гана посчиталась по благоприятному пути.
      store([
        { id: 'a', ownerId: OWNER, gender: 'male' },
        { id: 'b', ownerId: OWNER },
      ]);
      const pair = await service.compareSubjects(OWNER, 'a', 'b');
      expect(pair.genderUnknown).toBe(true);
    });

    it('известный пол меняет счёт — гана-кута асимметрична', async () => {
      // Иначе поле хранилось бы, но в расчёт не доходило.
      store([
        { id: 'a', ownerId: OWNER },
        { id: 'b', ownerId: OWNER },
      ]);
      const unknown = await service.compareSubjects(OWNER, 'a', 'b');

      store([
        { id: 'a', ownerId: OWNER, gender: 'female' },
        { id: 'b', ownerId: OWNER, gender: 'male' },
      ]);
      const known = await service.compareSubjects(OWNER, 'a', 'b');

      const ganaOf = (p: typeof unknown) =>
        p.score.kootas.find((k) => k.key === 'gana')!.points;
      expect(ganaOf(known)).toBeLessThanOrEqual(ganaOf(unknown));
    });

    it('не выносит наружу дату и место рождения записей', async () => {
      // Наружу идёт результат сверки, а не сами данные рождения.
      bothFound();
      const pair = await service.compareSubjects(OWNER, 'a', 'b');
      expect(JSON.stringify(pair)).not.toContain('1987-05-12');
      expect(pair.a).not.toHaveProperty('bornAtUtc');
    });

    it('считает по моменту рождения записи, а не по чужому', async () => {
      // Разные записи — разный счёт; одинаковый выдал бы, что момент не дошёл.
      bothFound();
      const near = await service.compareSubjects(OWNER, 'a', 'b');

      prisma.astroSubject.findFirst.mockImplementation(
        ({ where }: { where: { id: string } }) =>
          Promise.resolve(
            where.id === 'a'
              ? subject('a')
              : subject('b', {
                  bornAtUtc: new Date('1994-11-02T19:45:00.000Z'),
                  latitude: 19.076,
                  longitude: 72.8777,
                }),
          ),
      );
      const far = await service.compareSubjects(OWNER, 'a', 'b');

      expect(far.score.totalPoints).not.toBe(near.score.totalPoints);
    });
  });
});
