// AuthGuard тянет jose (ESM-only) — здесь гвард не нужен, мокаем модуль.
jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class {},
}));

import { GeoController } from './geo.controller';

describe('GeoController', () => {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('returns Nominatim city results and includes the country in the query', async () => {
    fetchMock.mockResolvedValueOnce(
      response([
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
          address: {
            city: 'Хабаровск',
            country: 'Россия',
          },
        },
      ]),
    );

    const result = await new GeoController().search('Хабаровск', 'Россия');

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
    const [url, options] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain(
      'q=%D0%A5%D0%B0%D0%B1%D0%B0%D1%80%D0%BE%D0%B2%D1%81%D0%BA%2C+%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D1%8F',
    );
    expect(new Headers(options.headers).get('Referer')).toBe(
      'https://vedamatch.ru/',
    );
  });

  it('retries with a city-only query when Nominatim finds nothing for "city, country"', async () => {
    fetchMock
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(
        response([
          {
            lat: '53.9025',
            lon: '27.5618',
            display_name: 'Мінск, Беларусь',
            type: 'administrative',
            address: { city: 'Мінск', country: 'Беларусь' },
          },
        ]),
      );

    const result = await new GeoController().search('Минск', 'Беларусь');

    expect(result).toEqual([
      {
        city: 'Мінск',
        country: 'Беларусь',
        lat: 53.9025,
        lon: 27.5618,
        displayName: 'Мінск, Беларусь',
        type: 'administrative',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl] = fetchMock.mock.calls[0] as unknown as [string];
    const [secondUrl] = fetchMock.mock.calls[1] as unknown as [string];
    expect(firstUrl).toContain('q=%D0%9C%D0%B8%D0%BD%D1%81%D0%BA%2C');
    expect(secondUrl).toContain('q=%D0%9C%D0%B8%D0%BD%D1%81%D0%BA&');
  }, 10000);

  it('returns city-only results unfiltered when none of them match the requested country', async () => {
    fetchMock
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(
        response([
          {
            lat: '53.9025',
            lon: '27.5618',
            display_name: 'Springfield, USA',
            type: 'city',
            address: { city: 'Springfield', country: 'США' },
          },
        ]),
      );

    const result = await new GeoController().search('Springfield', 'Narnia');

    expect(result).toEqual([
      expect.objectContaining({ city: 'Springfield', country: 'США' }),
    ]);
  }, 10000);

  it('falls back to Photon when Nominatim rejects the server', async () => {
    fetchMock.mockResolvedValueOnce(response(null, 403)).mockResolvedValueOnce(
      response({
        features: [
          {
            properties: {
              type: 'city',
              name: 'Хабаровск',
              county: 'городской округ Хабаровск',
              state: 'Хабаровский край',
              country: 'Россия',
            },
            geometry: {
              coordinates: [135.0762968, 48.4812568],
            },
          },
        ],
      }),
    );

    const result = await new GeoController().search('Хабаровск', 'Россия');

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
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [fallbackUrl] = fetchMock.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ];
    expect(fallbackUrl).toContain('photon.komoot.io/api/');
  });

  it('retries city-only against Photon too when Nominatim rate-limits the retry', async () => {
    // Combined query comes back empty (no exception), then the city-only
    // retry against Nominatim itself gets rate-limited (429) — the fallback
    // to Photon must not just resend the broken combined query.
    fetchMock
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response(null, 429))
      .mockResolvedValueOnce(response({ features: [] }))
      .mockResolvedValueOnce(
        response({
          features: [
            {
              properties: { type: 'city', name: 'Мінск', country: 'Беларусь' },
              geometry: { coordinates: [27.5618, 53.9025] },
            },
          ],
        }),
      );

    const result = await new GeoController().search('Минск', 'Беларусь');

    expect(result).toEqual([
      expect.objectContaining({ city: 'Мінск', country: 'Беларусь' }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [photonCombinedUrl] = fetchMock.mock.calls[2] as unknown as [string];
    const [photonCityUrl] = fetchMock.mock.calls[3] as unknown as [string];
    expect(photonCombinedUrl).toContain('q=%D0%9C%D0%B8%D0%BD%D1%81%D0%BA%2C');
    expect(photonCityUrl).toContain('q=%D0%9C%D0%B8%D0%BD%D1%81%D0%BA&');
  }, 10000);
});

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}
