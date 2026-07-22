import { GeoController } from './geo.controller';

describe('GeoController', () => {
  const fetchMock = jest.fn<typeof fetch>();

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
});

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}
