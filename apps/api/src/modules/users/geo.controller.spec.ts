// AuthGuard тянет jose (ESM-only) — здесь гвард не нужен, мокаем модуль.
jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class {},
}));

import { GeoController } from './geo.controller';
import type { PrismaService } from '../../prisma/prisma.service';

describe('GeoController', () => {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
  const queryRaw = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    // Справочник отвечает первым, поэтому тесты внешнего геокодера обязаны
    // начинать с пустого справочника — иначе до сети дело не дойдёт.
    queryRaw.mockReset();
    queryRaw.mockResolvedValue([]);
    route({});
  });

  const controller = () =>
    new GeoController({ $queryRaw: queryRaw } as unknown as PrismaService);

  /**
   * Порядок геокодеров — не деталь реализации, а то самое, что ломалось на
   * проде: Nominatim ищет по полному имени и на «Хабаровс» отдавал пустоту,
   * так что человек видел «Ничего не нашлось» на каждой набранной букве.
   */
  describe('автодополнение', () => {
    it('находит город по недонабранному имени через Photon и не зовёт Nominatim', async () => {
      route({ photon: () => photon([khabarovsk]) });

      const result = await controller().search('Хабаровс');

      expect(result).toEqual([
        {
          city: 'Хабаровск',
          country: 'Россия',
          lat: 48.4813,
          lon: 135.0763,
          displayName:
            'Хабаровск, городской округ Хабаровск, Хабаровский край, Россия',
          type: 'city',
        },
      ]);
      expect(calls('photon')).toHaveLength(1);
      expect(calls('nominatim')).toHaveLength(0);
    });

    /**
     * photon.komoot.io на `lang=ru` отвечает 400 «Language is not supported.
     * Supported are: default, de, en, fr». Пока `ru` стоял в списке
     * поддерживаемых, Photon отвечал ошибкой на каждый русскоязычный запрос,
     * то есть запасного геокодера у русской локали не было вовсе.
     */
    it('не шлёт в Photon неподдерживаемый lang=ru', async () => {
      route({ photon: () => photon([khabarovsk]) });

      await controller().search('Хабаровск', '', 'ru');

      expect(calls('photon')[0]).not.toContain('lang=');
    });

    it('шлёт в Photon поддерживаемый lang=en', async () => {
      route({ photon: () => photon([khabarovsk]) });

      await controller().search('Khabarovsk', '', 'en');

      expect(calls('photon')[0]).toContain('lang=en');
    });
  });

  /**
   * OSM подписывает часть городских границ административным словом: «городской
   * округ Казань», «город Ялта». В профиль обязано уехать голое имя — иначе
   * фильтр по городу не сводит двух соседей, выбравших один город из разных
   * подсказок.
   */
  it('снимает административный префикс с имени города', async () => {
    route({
      photon: () =>
        photon([
          {
            properties: {
              type: 'city',
              name: 'город Ялта',
              state: 'Республика Крым',
              country: 'Россия',
            },
            geometry: { coordinates: [34.1689, 44.4988] },
          },
        ]),
    });

    const [result] = await controller().search('Ялта');

    expect(result.city).toBe('Ялта');
  });

  it('добирает Nominatim, когда Photon ничего не нашёл', async () => {
    route({
      photon: () => photon([]),
      nominatim: () =>
        nominatim([
          {
            lat: '48.4813',
            lon: '135.0763',
            display_name: 'Хабаровск, Хабаровский край, Россия',
            type: 'city',
            address: {
              city: 'Хабаровск',
              state: 'Хабаровский край',
              country: 'Россия',
            },
          },
          {
            lat: '48.4820',
            lon: '135.0770',
            display_name: 'Хабаровск, Россия',
            type: 'administrative',
            address: { city: 'Хабаровск', country: 'Россия' },
          },
        ]),
    });

    const result = await controller().search('Хабаровск');

    expect(result).toEqual([
      {
        city: 'Хабаровск',
        country: 'Россия',
        lat: 48.4813,
        lon: 135.0763,
        displayName: 'Хабаровск, Хабаровский край, Россия',
        type: 'city',
      },
    ]);
    const [, options] = lastCall('nominatim');
    expect(new Headers(options.headers).get('Referer')).toBe(
      'https://vedamatch.ru/',
    );
  }, 10000);

  it('переспрашивает только по городу, когда «город, страна» ничего не дал', async () => {
    // Воспроизведено на проде для «Минск, Беларусь» при рабочем «Минск»:
    // комбинированный запрос пуст, запрос по одному городу — нет.
    route({
      photon: (url) =>
        url.includes('%2C') // «Минск, Беларусь» — запятая в запросе
          ? photon([])
          : photon([
              {
                properties: {
                  type: 'city',
                  name: 'Мінск',
                  country: 'Беларусь',
                },
                geometry: { coordinates: [27.5618, 53.9025] },
              },
            ]),
    });

    const result = await controller().search('Минск', 'Беларусь');

    expect(result).toEqual([
      expect.objectContaining({ city: 'Мінск', country: 'Беларусь' }),
    ]);
    expect(calls('photon')).toHaveLength(2);
    expect(calls('nominatim')).toHaveLength(0);
  }, 10000);

  it('отдаёт результаты по одному городу, когда ни один не совпал со страной', async () => {
    route({
      photon: (url) =>
        url.includes('%2C')
          ? photon([])
          : photon([
              {
                properties: {
                  type: 'city',
                  name: 'Springfield',
                  country: 'США',
                },
                geometry: { coordinates: [27.5618, 53.9025] },
              },
            ]),
    });

    const result = await controller().search('Springfield', 'Narnia');

    expect(result).toEqual([
      expect.objectContaining({ city: 'Springfield', country: 'США' }),
    ]);
  }, 10000);

  it('уходит в Nominatim, когда Photon отказал', async () => {
    route({
      photon: () => photon(null, 400),
      nominatim: () =>
        nominatim([
          {
            lat: '53.9025',
            lon: '27.5618',
            display_name: 'Мінск, Беларусь',
            type: 'city',
            address: { city: 'Мінск', country: 'Беларусь' },
          },
        ]),
    });

    const result = await controller().search('Минск');

    expect(result).toEqual([
      expect.objectContaining({ city: 'Мінск', country: 'Беларусь' }),
    ]);
    expect(calls('nominatim')).toHaveLength(1);
  }, 10000);

  /**
   * Отказ геокодера и честное «такого города нет» форма показывает разными
   * словами: под одной подписью человек читает их одинаково и до
   * бесконечности правит написание там, где править нечего.
   */
  it('отвечает 503, когда отказали оба геокодера', async () => {
    route({
      photon: () => photon(null, 429),
      nominatim: () => nominatim(null, 429),
    });

    await expect(controller().search('Хабаровск')).rejects.toMatchObject({
      status: 503,
    });
  }, 10000);

  it('отдаёт пустой список, когда геокодеры ответили и ничего не нашли', async () => {
    route({ photon: () => photon([]), nominatim: () => nominatim([]) });

    await expect(controller().search('Урюпинскк')).resolves.toEqual([]);
  }, 10000);

  /**
   * Справочник заведён ровно из-за «Маяпура»: OSM знает этот город только
   * латиницей и без `name:ru`, поэтому кириллический запрос возвращал пустоту,
   * а найденный по-английски уезжал в профиль как «Mayapur» — мимо русского
   * фильтра по городу у всех остальных.
   */
  describe('справочник городов', () => {
    const mayapur = {
      city: 'Маяпур',
      country: 'Индия',
      lat: 23.4234,
      lon: 88.3908,
      displayName: 'Маяпур, Западная Бенгалия, Индия',
    };

    it('отвечает сам и не идёт во внешний геокодер', async () => {
      queryRaw.mockResolvedValue([mayapur]);

      const result = await controller().search('Маяпур');

      expect(result).toEqual([
        {
          city: 'Маяпур',
          country: 'Индия',
          lat: 23.4234,
          lon: 88.3908,
          displayName: 'Маяпур, Западная Бенгалия, Индия',
          type: 'city',
        },
      ]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('ищет по началу написания и приводит «ё» к «е»', async () => {
      queryRaw.mockResolvedValue([mayapur]);

      await controller().search('Кишинёв');

      const needle = queryRaw.mock.calls[0].slice(1);
      expect(needle).toContain('кишинев%');
    });

    it('пустой справочник пропускает запрос дальше, во внешний геокодер', async () => {
      queryRaw.mockResolvedValue([]);
      route({ photon: () => photon([khabarovsk]) });

      await controller().search('Хабаровск');

      expect(calls('photon')).toHaveLength(1);
    });
  });

  const khabarovsk = {
    properties: {
      type: 'city',
      name: 'Хабаровск',
      county: 'городской округ Хабаровск',
      state: 'Хабаровский край',
      country: 'Россия',
    },
    geometry: { coordinates: [135.0762968, 48.4812568] },
  };

  /**
   * Мок по адресу, а не по порядку вызовов: перебор написаний и повтор «город
   * без страны» дают разное число обращений к каждому геокодеру, и очередь
   * `mockResolvedValueOnce` ломается от любой правки этой логики.
   */
  function route(handlers: {
    photon?: (url: string) => Response;
    nominatim?: (url: string) => Response;
  }) {
    fetchMock.mockImplementation((input) => {
      const url = urlOf(input);
      const handler = isPhoton(url) ? handlers.photon : handlers.nominatim;
      return Promise.resolve(
        handler ? handler(url) : isPhoton(url) ? photon([]) : nominatim([]),
      );
    });
  }

  function isPhoton(url: string): boolean {
    return url.includes('photon.komoot.io');
  }

  function calls(geocoder: 'photon' | 'nominatim'): string[] {
    return fetchMock.mock.calls
      .map(([input]) => urlOf(input))
      .filter((url) => isPhoton(url) === (geocoder === 'photon'));
  }

  function lastCall(geocoder: 'photon' | 'nominatim'): [string, RequestInit] {
    const call = fetchMock.mock.calls
      .filter(([input]) => isPhoton(urlOf(input)) === (geocoder === 'photon'))
      .at(-1);
    if (!call) throw new Error(`нет вызовов ${geocoder}`);
    return call as unknown as [string, RequestInit];
  }
});

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function nominatim(body: unknown, status = 200): Response {
  return response(body, status);
}

function photon(features: unknown, status = 200): Response {
  return response(features === null ? null : { features }, status);
}

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}
