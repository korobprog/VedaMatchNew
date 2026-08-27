import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AstroSubjectsService } from './astro-subjects.service';

const OWNER = 'owner-1';

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'subject-1',
    name: 'Радха',
    bornAtUtc: new Date('1985-03-07T09:30:00.000Z'),
    birthDateLocal: new Date('1985-03-07T00:00:00.000Z'),
    birthTimeLocal: '15:00',
    timeAccuracy: 'exact',
    placeLabel: 'Москва',
    latitude: 55.75,
    longitude: 37.61,
    timezone: 'Europe/Moscow',
    notes: null,
    createdAt: new Date('2026-08-27T00:00:00.000Z'),
    updatedAt: new Date('2026-08-27T00:00:00.000Z'),
    ...over,
  };
}

/**
 * Первый аргумент вызова мока в нужной форме. Через `unknown`, а не напрямую:
 * `mock.calls` типизирован как `any`, и обращение к полю по цепочке протаскивает
 * `any` дальше по тесту.
 */
function argOf<T>(fn: { mock: { calls: unknown[][] } }, index = 0): T {
  return fn.mock.calls[index][0] as T;
}

type CreateArg = { data: Record<string, unknown> };
type WhereArg = { where: Record<string, unknown>; orderBy?: unknown };

const body = (over: Record<string, unknown> = {}) => ({
  name: 'Радха',
  birthDate: '1985-03-07',
  birthTime: '15:00',
  place: { label: 'Москва', latitude: 55.75, longitude: 37.61 },
  ...over,
});

describe('AstroSubjectsService', () => {
  const prisma = {
    astroSubject: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const service = new AstroSubjectsService(prisma as unknown as PrismaService);

  beforeEach(() => jest.resetAllMocks());

  /**
   * Главное свойство модуля: владелец входит в условие запроса, а не
   * проверяется после. Здесь лежат данные людей, ничего порталу не
   * разрешавших, и «нашли, но не отдали» — на одну забытую строку хуже, чем
   * «не нашли вовсе».
   */
  describe('владелец в условии, а не в проверке после', () => {
    it('список берёт только свои записи', async () => {
      prisma.astroSubject.findMany.mockResolvedValue([]);
      await service.list(OWNER);
      expect(argOf<WhereArg>(prisma.astroSubject.findMany)).toMatchObject({
        where: { ownerId: OWNER },
      });
    });

    it('чтение ищет по паре id и владельца', async () => {
      prisma.astroSubject.findFirst.mockResolvedValue(row());
      await service.get(OWNER, 'subject-1');
      expect(argOf<WhereArg>(prisma.astroSubject.findFirst)).toEqual({
        where: { id: 'subject-1', ownerId: OWNER },
      });
    });

    it('чужая запись не находится — 404, а не 403', async () => {
      prisma.astroSubject.findFirst.mockResolvedValue(null);
      await expect(service.get(OWNER, 'someone-else')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('правка идёт updateMany с владельцем в условии', async () => {
      // update по одному id обновил бы чужую строку.
      prisma.astroSubject.updateMany.mockResolvedValue({ count: 1 });
      prisma.astroSubject.findFirst.mockResolvedValue(row());
      await service.update(OWNER, 'subject-1', body());
      expect(argOf<WhereArg>(prisma.astroSubject.updateMany)).toMatchObject({
        where: { id: 'subject-1', ownerId: OWNER },
      });
    });

    it('правка чужой записи не проходит', async () => {
      prisma.astroSubject.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.update(OWNER, 'someone-else', body()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('удаление тоже с владельцем в условии', async () => {
      prisma.astroSubject.deleteMany.mockResolvedValue({ count: 1 });
      await service.remove(OWNER, 'subject-1');
      expect(argOf<WhereArg>(prisma.astroSubject.deleteMany)).toEqual({
        where: { id: 'subject-1', ownerId: OWNER },
      });
    });

    it('удаление чужой записи не проходит', async () => {
      prisma.astroSubject.deleteMany.mockResolvedValue({ count: 0 });
      await expect(
        service.remove(OWNER, 'someone-else'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('создание кладёт владельца из аргумента', async () => {
      prisma.astroSubject.create.mockResolvedValue(row());
      await service.create(OWNER, body());
      expect(argOf<CreateArg>(prisma.astroSubject.create).data).toMatchObject({
        ownerId: OWNER,
      });
    });
  });

  describe('разбор запроса', () => {
    it('требует имя — иначе список станет безымянным', async () => {
      await expect(
        service.create(OWNER, body({ name: '  ' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('требует место рождения с координатами', async () => {
      await expect(
        service.create(OWNER, body({ place: { label: 'Москва' } })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('не принимает координаты вне шкалы', async () => {
      await expect(
        service.create(
          OWNER,
          body({ place: { label: 'Нигде', latitude: 91, longitude: 0 } }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('обрезает пробелы в имени и заметке', async () => {
      prisma.astroSubject.create.mockResolvedValue(row());
      await service.create(OWNER, body({ name: '  Радха  ', notes: '  ок  ' }));
      expect(argOf<CreateArg>(prisma.astroSubject.create).data).toMatchObject({
        name: 'Радха',
        notes: 'ок',
      });
    });

    it('пустая заметка хранится как null, а не пустой строкой', async () => {
      prisma.astroSubject.create.mockResolvedValue(row());
      await service.create(OWNER, body({ notes: '   ' }));
      expect(
        argOf<CreateArg>(prisma.astroSubject.create).data.notes,
      ).toBeNull();
    });

    it('при неизвестном времени не сохраняет введённое время', async () => {
      prisma.astroSubject.create.mockResolvedValue(row());
      await service.create(
        OWNER,
        body({ timeAccuracy: 'unknown', birthTime: '15:00' }),
      );
      expect(
        argOf<CreateArg>(prisma.astroSubject.create).data.birthTimeLocal,
      ).toBeNull();
    });

    it('неизвестную точность приводит к «точно», а не падает', async () => {
      prisma.astroSubject.create.mockResolvedValue(row());
      await service.create(OWNER, body({ timeAccuracy: 'чепуха' }));
      expect(
        argOf<CreateArg>(prisma.astroSubject.create).data.timeAccuracy,
      ).toBe('exact');
    });

    it('локальную дату берёт из введённой строки, а не из UTC', async () => {
      // В Мумбаи вечернее рождение приходится на предыдущие сутки по UTC —
      // обратный пересчёт сдвинул бы календарный день.
      prisma.astroSubject.create.mockResolvedValue(row());
      await service.create(
        OWNER,
        body({
          birthDate: '1985-03-07',
          birthTime: '23:30',
          place: { label: 'Мумбаи', latitude: 19.07, longitude: 72.87 },
        }),
      );
      const { data } = argOf<CreateArg>(prisma.astroSubject.create);
      expect((data.birthDateLocal as Date).toISOString()).toBe(
        '1985-03-07T00:00:00.000Z',
      );
      expect((data.bornAtUtc as Date).toISOString()).toBe(
        '1985-03-07T18:00:00.000Z',
      );
    });
  });

  describe('ответ наружу', () => {
    it('отдаёт введённые дату и время, а не пересчитанные из UTC', async () => {
      prisma.astroSubject.findFirst.mockResolvedValue(row());
      const dto = await service.get(OWNER, 'subject-1');
      expect(dto.birthDate).toBe('1985-03-07');
      expect(dto.birthTime).toBe('15:00');
    });

    it('считает смещение пояса на чтение', async () => {
      prisma.astroSubject.findFirst.mockResolvedValue(row());
      const dto = await service.get(OWNER, 'subject-1');
      expect(dto.utcOffsetMinutes).toBe(180);
      expect(dto.timezone).toBe('Europe/Moscow');
    });

    it('не выносит наружу ownerId — он и так известен спросившему', async () => {
      prisma.astroSubject.findFirst.mockResolvedValue(row({ ownerId: OWNER }));
      const dto = await service.get(OWNER, 'subject-1');
      expect(dto).not.toHaveProperty('ownerId');
    });

    it('список отдаёт свежие сверху', async () => {
      prisma.astroSubject.findMany.mockResolvedValue([]);
      await service.list(OWNER);
      expect(argOf<WhereArg>(prisma.astroSubject.findMany)).toMatchObject({
        orderBy: { updatedAt: 'desc' },
      });
    });
  });
});
