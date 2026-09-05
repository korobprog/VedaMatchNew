import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildSearchWhere,
  normalizeLocationKey,
  normalizeSearchFilters,
  searchOrderBy,
  toStringList,
} from './people-search-query';
import type {
  NormalizedSearchFilters,
  SearchViewer,
} from './people-search-query';

const now = new Date('2026-08-13T10:00:00.000Z');

/** Плейсхолдеры обратно в текст — только чтобы проверять условие глазами. */
function render(sql: Prisma.Sql): string {
  return sql.text.replace(/\$(\d+)/g, (_, index: string) =>
    JSON.stringify(sql.values[Number(index) - 1]),
  );
}

function viewer(overrides: Partial<SearchViewer> = {}): SearchViewer {
  return {
    id: 'viewer',
    isVerifiedDevotee: false,
    isPortalStaff: false,
    cityKey: null,
    lat: null,
    lon: null,
    ...overrides,
  };
}

function filters(
  overrides: Partial<NormalizedSearchFilters> = {},
): NormalizedSearchFilters {
  return { ...normalizeSearchFilters({}), ...overrides };
}

function where(
  overrides: {
    viewer?: Partial<SearchViewer>;
    filters?: Partial<NormalizedSearchFilters>;
    hiddenUserIds?: string[];
  } = {},
): string {
  return render(
    buildSearchWhere({
      filters: filters(overrides.filters),
      viewer: viewer(overrides.viewer),
      hiddenUserIds: overrides.hiddenUserIds ?? [],
      now,
    }),
  );
}

describe('normalizeSearchFilters', () => {
  it('ставит значения по умолчанию на пустом запросе', () => {
    expect(normalizeSearchFilters({})).toEqual(
      expect.objectContaining({
        q: null,
        city: null,
        radiusKm: null,
        stages: [],
        tagIds: [],
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        verifiedDevoteeOnly: false,
      }),
    );
  });

  it('обрезает размер страницы до максимума', () => {
    expect(normalizeSearchFilters({ pageSize: '500' }).pageSize).toBe(
      MAX_PAGE_SIZE,
    );
    expect(normalizeSearchFilters({ pageSize: '51' }).pageSize).toBe(
      MAX_PAGE_SIZE,
    );
    expect(normalizeSearchFilters({ pageSize: '10' }).pageSize).toBe(10);
  });

  it('нормализует страницу меньше первой', () => {
    expect(normalizeSearchFilters({ page: '0' }).page).toBe(1);
    expect(normalizeSearchFilters({ page: '-7' }).page).toBe(1);
    expect(normalizeSearchFilters({ page: '3' }).page).toBe(3);
  });

  it('принимает списки и повторением ключа, и через запятую', () => {
    expect(toStringList(['a', 'b,c'], 'Теги')).toEqual(['a', 'b', 'c']);
    expect(toStringList('a, a , b', 'Теги')).toEqual(['a', 'b']);
    expect(toStringList(undefined, 'Теги')).toEqual([]);
  });

  it('отвергает неизвестное значение перечисления', () => {
    expect(() => normalizeSearchFilters({ stages: 'monk' })).toThrow(
      BadRequestException,
    );
    expect(() => normalizeSearchFilters({ ashram: 'grihastha,king' })).toThrow(
      BadRequestException,
    );
  });

  it('отвергает нечисловой и отрицательный радиус', () => {
    expect(() => normalizeSearchFilters({ radiusKm: 'рядом' })).toThrow(
      BadRequestException,
    );
    expect(() => normalizeSearchFilters({ radiusKm: '0' })).toThrow(
      BadRequestException,
    );
  });
});

describe('normalizeLocationKey', () => {
  it('сравнивает город без регистра и краевых пробелов', () => {
    expect(normalizeLocationKey('  МоСкВа ')).toBe('москва');
    expect(normalizeLocationKey('   ')).toBeNull();
    expect(normalizeLocationKey(undefined)).toBeNull();
  });
});

describe('buildSearchWhere: видимость', () => {
  it('берёт только активные и не на паузе', () => {
    const sql = where();
    expect(sql).toContain(`p."status" = 'active'`);
    expect(sql).toContain(
      `(p."pausedUntil" IS NULL OR p."pausedUntil" <= "2026-08-13T10:00:00.000Z")`,
    );
  });

  it('никогда не показывает by_link и hidden', () => {
    const sql = where({
      viewer: { isVerifiedDevotee: true, cityKey: 'москва' },
    });
    expect(sql).toContain(`p."visibility" = 'everyone'`);
    expect(sql).not.toContain('by_link');
    expect(sql).not.toContain(`p."visibility" = 'hidden'`);
  });

  it('открывает verified_only только подтверждённому преданному', () => {
    expect(where({ viewer: { isVerifiedDevotee: true } })).toContain(
      `p."visibility" = 'verified_only'`,
    );
    expect(where({ viewer: { isVerifiedDevotee: false } })).not.toContain(
      'verified_only',
    );
  });

  it('открывает same_city только при совпадении города смотрящего', () => {
    const sql = where({ viewer: { cityKey: 'москва' } });
    expect(sql).toContain(
      `(p."visibility" = 'same_city' AND lower(trim(u."homeLocation"->>'city')) = "москва")`,
    );
    // Город смотрящего не заполнен — уровня в условии нет вовсе.
    expect(where()).not.toContain('same_city');
  });

  it('исключает скрытых и самого смотрящего', () => {
    const sql = where({ hiddenUserIds: ['a', 'b'] });
    expect(sql).toContain(`p."userId" <> "viewer"`);
    expect(sql).toContain(`p."userId" NOT IN ("a","b")`);
  });

  it('не добавляет NOT IN, когда скрывать некого', () => {
    expect(where()).not.toContain('NOT IN');
  });

  /**
   * Администрация портала — друг всех. Иначе поддержка не находит половину
   * людей, а человек не находит, кому написать.
   */
  it('карточка администратора попадает в выдачу мимо уровней', () => {
    expect(where()).toContain(
      `(u."role" = 'admin' AND p."visibility" <> 'hidden')`,
    );
  });

  it('администратору открыты все уровни, кроме hidden', () => {
    // Отдельным уровнем, а не внутри условия про роль владельца — поэтому
    // сверяем с `OR`: без него подстрока нашлась бы и у обычного зрителя.
    const sql = where({ viewer: { isPortalStaff: true } });
    expect(sql).toContain(`OR p."visibility" <> 'hidden'`);
    expect(where()).not.toContain(`OR p."visibility" <> 'hidden'`);
  });
});

describe('buildSearchWhere: фильтры', () => {
  it('ищет подстроку по карточке и имени, экранируя шаблон', () => {
    const sql = where({ filters: { q: '100%_повар' } });
    expect(sql).toContain(String.raw`p."headline" ILIKE "%100\\%\\_повар%"`);
    expect(sql).toContain(String.raw`u."name" ILIKE "%100\\%\\_повар%"`);
  });

  it('сравнивает город и страну нормализованно', () => {
    const sql = where({
      filters: { city: ' СаНкт-Петербург ', country: 'Россия' },
    });
    expect(sql).toContain(
      `lower(trim(u."homeLocation"->>'city')) = "санкт-петербург"`,
    );
    expect(sql).toContain(
      `lower(trim(u."homeLocation"->>'country')) = "россия"`,
    );
  });

  it('требует ВСЕ переданные теги, а не любой из них', () => {
    const sql = where({ filters: { tagIds: ['t1', 't2'] } });
    expect(sql).toContain(`link."tagId" IN ("t1","t2")`);
    expect(sql).toContain(') = 2');
  });

  it('по языкам работает пересечением множеств портального профиля', () => {
    // Языки переехали в `User`: человек заполняет их один раз, а Знакомства
    // и справочник читают одно и то же.
    expect(where({ filters: { languages: ['русский', 'hindi'] } })).toContain(
      `u."languages" && ARRAY["русский","hindi"]::text[]`,
    );
  });

  it('переносит остальные фильтры в SQL', () => {
    const sql = where({
      filters: {
        stages: ['devotee', 'yogi'],
        ashram: ['grihastha'],
        format: 'online',
        verifiedDevoteeOnly: true,
        photoVerifiedOnly: true,
      },
    });
    expect(sql).toContain(`u."spiritualStage"::text IN ("devotee","yogi")`);
    expect(sql).toContain(`p."ashram"::text IN ("grihastha")`);
    expect(sql).toContain(`p."format"::text IN ("online", 'any')`);
    expect(sql).toContain(`u."devoteeVerificationStatus" = 'confirmed'`);
    expect(sql).toContain(`u."photoVerifiedAt" IS NOT NULL`);
  });

  it('пускает карточку с форматом «любой» в выдачу по онлайну', () => {
    // Человек сказал «мне всё равно» — он должен находиться и по «онлайн»,
    // и по «офлайн», иначе выпадает из обеих выдач сразу.
    expect(where({ filters: { format: 'offline' } })).toContain(
      `p."format"::text IN ("offline", 'any')`,
    );
  });

  it('не ставит условия, когда формат не важен', () => {
    expect(where({ filters: { format: 'any' } })).not.toContain(`p."format"`);
  });
});

describe('buildSearchWhere: радиус', () => {
  it('отсекает рамкой и точной формулой', () => {
    const sql = where({
      filters: { radiusKm: 100 },
      viewer: { lat: 55.75, lon: 37.62 },
    });
    expect(sql).toContain(`jsonb_typeof(u."homeLocation"->'lat') = 'number'`);
    expect(sql).toContain('BETWEEN');
    expect(sql).toContain('asin(least(1, sqrt(');
    expect(sql).toContain('<= 100');
  });

  it('требует координаты у смотрящего, когда точка на карте не выбрана', () => {
    expect(() =>
      where({ filters: { radiusKm: 50 }, viewer: { lat: null, lon: null } }),
    ).toThrow(BadRequestException);
    expect(() =>
      where({ filters: { radiusKm: 50 }, viewer: { lat: 55.75, lon: null } }),
    ).toThrow('Поиск по радиусу требует указанного города');
  });

  it('считает от точки на карте, а не от города смотрящего', () => {
    // Карту увели в другой город — искать надо там, куда её увели.
    const sql = where({
      filters: { radiusKm: 100, lat: 48.4813, lon: 135.0763 },
      viewer: { lat: 55.75, lon: 37.62 },
    });
    expect(sql).toContain('48.4813');
    expect(sql).not.toContain('55.75');
  });

  it('пускает поиск по карте, когда у смотрящего города нет', () => {
    expect(() =>
      where({
        filters: { radiusKm: 100, lat: 48.4813, lon: 135.0763 },
        viewer: { lat: null, lon: null },
      }),
    ).not.toThrow();
  });
});

describe('normalizeSearchFilters: центр карты', () => {
  it('разбирает пару координат', () => {
    expect(normalizeSearchFilters({ lat: '48.4813', lon: '135.0763' })).toEqual(
      expect.objectContaining({ lat: 48.4813, lon: 135.0763 }),
    );
  });

  it('без координат оставляет центр пустым', () => {
    expect(normalizeSearchFilters({})).toEqual(
      expect.objectContaining({ lat: null, lon: null }),
    );
  });

  it('не принимает половину центра', () => {
    expect(() => normalizeSearchFilters({ lat: '48.4813' })).toThrow(
      'Центр поиска задаётся широтой и долготой вместе',
    );
  });

  it('не принимает координаты вне диапазона', () => {
    expect(() => normalizeSearchFilters({ lat: '91', lon: '0' })).toThrow(
      BadRequestException,
    );
    expect(() => normalizeSearchFilters({ lat: '0', lon: '181' })).toThrow(
      BadRequestException,
    );
  });
});

describe('порядок выдачи справочника', () => {
  const sql = (sort: Parameters<typeof searchOrderBy>[0]) =>
    searchOrderBy(sort).sql.replace(/\s+/g, ' ').trim();

  it('по умолчанию сверху недавно заходившие', () => {
    expect(sql('active')).toContain('lastSeenAt" DESC');
  });

  it('алфавит считает по показанному имени, а не по мирскому всегда', () => {
    // В карточке видно то, что отдаёт resolveDisplayName; сортировка по
    // скрытому имени выглядела бы случайной.
    expect(sql('alpha')).toContain('COALESCE(u."spiritualName", u."name")');
  });

  it('алфавит ставит «Ё» рядом с «Е», а не в конец по коду символа', () => {
    expect(sql('alpha')).toContain('COLLATE "ru-RU-x-icu"');
  });

  it('«новые» считает по дате карточки', () => {
    expect(sql('new')).toContain('p."createdAt" DESC');
  });

  it('город без города уходит в конец, а не в начало', () => {
    expect(sql('city')).toContain('p."city"');
    expect(sql('city')).toContain('NULLS LAST');
  });

  it('у каждого порядка есть tiebreak по id', () => {
    // Без него запись приходит на двух страницах подряд либо ни на одной.
    for (const sort of ['active', 'alpha', 'new', 'city'] as const)
      expect(sql(sort)).toContain('p."id" DESC');
  });
});

describe('normalizeSearchFilters — порядок', () => {
  it('без параметра — порядок по умолчанию', () => {
    expect(normalizeSearchFilters({}).sort).toBe('active');
  });

  it('принимает известный порядок', () => {
    expect(normalizeSearchFilters({ sort: 'alpha' }).sort).toBe('alpha');
  });

  it('незнакомое значение отбивает, а не подменяет молча', () => {
    // Как и остальные перечисления этого разбора: подменить непонятый
    // параметр значит соврать выдачей.
    expect(() => normalizeSearchFilters({ sort: 'по-алфавиту' })).toThrow(
      BadRequestException,
    );
  });
});
