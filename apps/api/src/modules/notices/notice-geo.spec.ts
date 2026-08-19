import { BadRequestException } from '@nestjs/common';
import {
  MAP_POINTS_CAP,
  MAP_POINTS_MIN_ZOOM,
  MAX_RADIUS_KM,
  boundingBox,
  boundsWhere,
  coordsForPrecision,
  haversineKm,
  parseBounds,
  parseRadius,
  radiusIdsSql,
  resolveMapMode,
} from './notice-geo';

describe('parseRadius', () => {
  it('без radiusKm фильтра нет', () => {
    expect(parseRadius({})).toBeNull();
  });

  it('читает радиус с точкой', () => {
    expect(parseRadius({ radiusKm: '50', lat: '55.75', lon: '37.62' })).toEqual(
      { radiusKm: 50, lat: 55.75, lon: 37.62 },
    );
  });

  it('радиус без точки не от чего отсчитывать', () => {
    expect(() => parseRadius({ radiusKm: '50' })).toThrow(BadRequestException);
    expect(() => parseRadius({ radiusKm: '50', lat: '55.75' })).toThrow(
      BadRequestException,
    );
  });

  it('отвергает нечисловой, нулевой и запредельный радиус', () => {
    const point = { lat: '55.75', lon: '37.62' };
    expect(() => parseRadius({ ...point, radiusKm: 'рядом' })).toThrow(
      BadRequestException,
    );
    expect(() => parseRadius({ ...point, radiusKm: '0' })).toThrow(
      BadRequestException,
    );
    expect(() => parseRadius({ ...point, radiusKm: '-5' })).toThrow(
      BadRequestException,
    );
    expect(() =>
      parseRadius({ ...point, radiusKm: String(MAX_RADIUS_KM + 1) }),
    ).toThrow(BadRequestException);
  });

  it('отвергает точку за пределами глобуса', () => {
    expect(() => parseRadius({ radiusKm: '10', lat: '91', lon: '0' })).toThrow(
      BadRequestException,
    );
    expect(() => parseRadius({ radiusKm: '10', lat: '0', lon: '181' })).toThrow(
      BadRequestException,
    );
  });
});

describe('boundingBox', () => {
  it('ставит рамку по обеим осям в обычном случае', () => {
    const box = boundingBox(55.75, 37.62, 100);
    expect(box.minLat).toBeLessThan(55.75);
    expect(box.maxLat).toBeGreaterThan(55.75);
    expect(box.minLon).not.toBeNull();
    expect(box.maxLon).not.toBeNull();
  });

  it('у полюса рамку по долготе не ставит', () => {
    // Там градус долготы вырождается, и рамка обняла бы весь глобус.
    const box = boundingBox(90, 0, 100);
    expect(box.minLon).toBeNull();
    expect(box.maxLon).toBeNull();
  });

  it('на антимеридиане рамку по долготе не ставит', () => {
    // Рамка распалась бы на два интервала; гаверсинус справится сам.
    const box = boundingBox(0, 179.9, 500);
    expect(box.minLon).toBeNull();
  });

  it('очень большой радиус тоже оставляет без рамки по долготе', () => {
    expect(boundingBox(0, 0, 19_000).minLon).toBeNull();
  });
});

describe('haversineKm', () => {
  it('нулевое расстояние до себя', () => {
    expect(haversineKm(55.75, 37.62, 55.75, 37.62)).toBeCloseTo(0, 6);
  });

  it('Москва — Петербург примерно 630 км', () => {
    const km = haversineKm(55.7558, 37.6173, 59.9311, 30.3609);
    expect(km).toBeGreaterThan(600);
    expect(km).toBeLessThan(660);
  });

  it('симметрично', () => {
    expect(haversineKm(10, 20, 30, 40)).toBeCloseTo(
      haversineKm(30, 40, 10, 20),
      9,
    );
  });
});

describe('radiusIdsSql', () => {
  const sql = (filter: Parameters<typeof radiusIdsSql>[0]) =>
    radiusIdsSql(filter).sql;

  it('отсекает рамкой и точной формулой', () => {
    const text = sql({ radiusKm: 100, lat: 55.75, lon: 37.62 });
    expect(text).toContain('BETWEEN');
    expect(text).toContain('asin(least(1, sqrt(');
    expect(text).toContain('LIMIT');
  });

  it('пропускает записи без координат', () => {
    expect(sql({ radiusKm: 10, lat: 0, lon: 0 })).toContain(
      '"latitude" IS NOT NULL',
    );
  });

  it('у полюса рамки по долготе в SQL нет', () => {
    const text = sql({ radiusKm: 100, lat: 90, lon: 0 });
    expect(text).not.toContain('"longitude" BETWEEN');
    // Но гаверсинус остаётся — ответ всё равно верный.
    expect(text).toContain('asin');
  });
});

describe('resolveMapMode', () => {
  it('на мелком зуме всегда агрегаты', () => {
    expect(resolveMapMode(1, MAP_POINTS_MIN_ZOOM - 1)).toBe('clusters');
    expect(resolveMapMode(0, 3)).toBe('clusters');
  });

  it('на крупном зуме точки, пока их немного', () => {
    expect(resolveMapMode(MAP_POINTS_CAP, MAP_POINTS_MIN_ZOOM)).toBe('points');
    expect(resolveMapMode(MAP_POINTS_CAP + 1, MAP_POINTS_MIN_ZOOM)).toBe(
      'clusters',
    );
  });

  it('мусорный зум трактуется как мелкий', () => {
    expect(resolveMapMode(1, Number.NaN)).toBe('clusters');
  });
});

describe('parseBounds', () => {
  it('нормализует перевёрнутую рамку', () => {
    expect(
      parseBounds({ minLat: '60', maxLat: '55', minLon: '40', maxLon: '30' }),
    ).toEqual({ minLat: 55, maxLat: 60, minLon: 30, maxLon: 40 });
  });

  it('на мусоре возвращает null, а не падает', () => {
    expect(parseBounds({})).toBeNull();
    expect(
      parseBounds({ minLat: 'юг', maxLat: '1', minLon: '1', maxLon: '2' }),
    ).toBeNull();
  });

  it('превращается в условие по обеим осям', () => {
    expect(
      boundsWhere({ minLat: 55, maxLat: 60, minLon: 30, maxLon: 40 }),
    ).toEqual({
      latitude: { gte: 55, lte: 60 },
      longitude: { gte: 30, lte: 40 },
    });
  });
});

describe('coordsForPrecision', () => {
  it('city: координаты прибиваются к сетке, дом по ним не найти', () => {
    // Точный адрес в Москве.
    const { lat, lon } = coordsForPrecision(55.751244, 37.618423, 'city');
    expect(lat).toBeCloseTo(55.76, 6);
    expect(lon).toBeCloseTo(37.62, 6);
    expect(lat).not.toBe(55.751244);
  });

  it('city: центроид из геокодера почти не сдвигается', () => {
    const { lat, lon } = coordsForPrecision(55.7558, 37.6173, 'city');
    expect(Math.abs(lat - 55.7558)).toBeLessThan(0.02);
    expect(Math.abs(lon - 37.6173)).toBeLessThan(0.02);
  });

  it('exact: не трогаем', () => {
    expect(coordsForPrecision(55.751244, 37.618423, 'exact')).toEqual({
      lat: 55.751244,
      lon: 37.618423,
    });
  });
});
