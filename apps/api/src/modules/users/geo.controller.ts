import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import type { GeoSearchResult } from '@vedamatch/shared';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const PHOTON_URL = 'https://photon.komoot.io';
const DEFAULT_USER_AGENT = 'VedaMatch/1.0 (+https://vedamatch.ru)';

interface NominatimPlace {
  lat: string;
  lon: string;
  display_name?: string;
  type?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

interface PhotonFeature {
  properties?: {
    type?: string;
    name?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
  };
  geometry?: {
    coordinates?: number[];
  };
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

@Controller('geo')
export class GeoController {
  @Get('search')
  async search(
    @Query('q') q: string,
    @Query('country') countryQuery?: string,
  ): Promise<GeoSearchResult[]> {
    const query = String(q ?? '').trim();
    const country = String(countryQuery ?? '').trim();
    if (query.length < 2) return [];
    if (query.length > 120)
      throw new BadRequestException('Слишком длинный запрос');
    if (country.length > 100)
      throw new BadRequestException('Слишком длинное название страны');

    try {
      // requestNominatim() already serializes and paces every outgoing call
      // (see scheduleNominatimCall), so the retry below is naturally spaced.
      return await searchWithCityFallback(query, country, (q) =>
        nominatimSettlements(q),
      );
    } catch (error) {
      if (!shouldUseFallback(error)) throw error;
      // Тот же провал «город, страна» воспроизводится и у Photon — применяем
      // ту же стратегию ретрая, а не просто пересылаем туда исходный запрос.
      return searchWithCityFallback(query, country, (q) => searchPhoton(q));
    }
  }

  @Get('reverse')
  async reverse(
    @Query('lat') latQuery: string,
    @Query('lon') lonQuery: string,
  ): Promise<GeoSearchResult> {
    const lat = Number(latQuery);
    const lon = Number(lonQuery);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new BadRequestException('Некорректная широта');
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      throw new BadRequestException('Некорректная долгота');
    }

    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: 'jsonv2',
      addressdetails: '1',
      zoom: '10',
    });

    const place = await requestNominatim<NominatimPlace>(`/reverse?${params}`);
    const result = toGeoSearchResult(place);
    if (!result) throw new BadRequestException('Город не найден');
    return result;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Nominatim's usage policy allows only 1 req/sec total. The per-request retry
// delay above only spaces out a single request's own retry; concurrent users
// hitting /geo/search still collectively exceed that limit and get 403/429,
// forcing the weaker Photon fallback. Serialize all outgoing Nominatim calls
// through one queue so the whole process honors the limit, not just one call.
let nominatimQueueTail: Promise<void> = Promise.resolve();
function scheduleNominatimCall<T>(fn: () => Promise<T>): Promise<T> {
  const result = nominatimQueueTail.then(fn);
  nominatimQueueTail = result.then(
    () => sleep(1100),
    () => sleep(1100),
  );
  return result;
}

// Некоторые сочетания «город, страна» не находятся полнотекстовым поиском
// (и у Nominatim, и у Photon), хотя сам город находится без страны —
// воспроизведено на проде для «Минск, Беларусь» при рабочем «Минск».
// Переспрашиваем только по городу и, если получится, сужаем по стране;
// иначе отдаём как есть — лучше нерелевантная страна, чем пустой список.
async function searchWithCityFallback(
  query: string,
  country: string,
  fetchPlaces: (q: string, isRetry: boolean) => Promise<GeoSearchResult[]>,
): Promise<GeoSearchResult[]> {
  const combined = await fetchPlaces(
    [query, country].filter(Boolean).join(', '),
    false,
  );
  if (combined.length > 0 || !country) return combined;

  const cityOnly = await fetchPlaces(query, true);
  const byCountry = cityOnly.filter((place) => matchesCountry(place, country));
  return byCountry.length > 0 ? byCountry : cityOnly;
}

async function nominatimSettlements(q: string): Promise<GeoSearchResult[]> {
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '6',
  });
  const places = await requestNominatim<NominatimPlace[]>(`/search?${params}`);
  return uniqueLocations(
    places
      .filter(isNominatimSettlement)
      .map(toGeoSearchResult)
      .filter(Boolean) as GeoSearchResult[],
  );
}

function matchesCountry(place: GeoSearchResult, country: string): boolean {
  const needle = country.trim().toLocaleLowerCase();
  return (place.country ?? '').trim().toLocaleLowerCase().includes(needle);
}

async function requestNominatim<T>(path: string): Promise<T> {
  return scheduleNominatimCall(async () => {
    const res = await fetch(`${NOMINATIM_URL}${path}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': process.env.NOMINATIM_USER_AGENT ?? DEFAULT_USER_AGENT,
        Referer: 'https://vedamatch.ru/',
      },
    });
    if (!res.ok) {
      throw new GeocoderRequestError(res.status);
    }
    return (await res.json()) as T;
  });
}

const PHOTON_SETTLEMENT_TYPES = new Set([
  'city',
  'town',
  'village',
  'hamlet',
  'district',
  'state',
]);

async function searchPhoton(q: string): Promise<GeoSearchResult[]> {
  const params = new URLSearchParams({ q, limit: '6' });
  const res = await fetch(`${PHOTON_URL}/api/?${params}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': process.env.NOMINATIM_USER_AGENT ?? DEFAULT_USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new BadRequestException(`Ошибка геопоиска: ${res.status}`);
  }
  const payload = (await res.json()) as PhotonResponse;
  return uniqueLocations(
    (payload.features ?? [])
      .filter((feature) =>
        PHOTON_SETTLEMENT_TYPES.has(feature.properties?.type ?? ''),
      )
      .map(toPhotonGeoSearchResult)
      .filter(Boolean) as GeoSearchResult[],
  );
}

function shouldUseFallback(error: unknown): boolean {
  return (
    error instanceof GeocoderRequestError &&
    (error.upstreamStatus === 403 ||
      error.upstreamStatus === 429 ||
      error.upstreamStatus >= 500)
  );
}

class GeocoderRequestError extends BadRequestException {
  constructor(readonly upstreamStatus: number) {
    super(`Ошибка геопоиска: ${upstreamStatus}`);
  }
}

// Nominatim's `address.city` for Russian regional-capital "urban okrug"
// boundaries (e.g. Kazan, Ufa) comes back as "городской округ Казань"
// rather than just "Казань" — the admin-division label is baked into the
// name field itself. Stored profiles use the plain city name, so an
// unstripped prefix silently breaks the filter's substring match.
const ADMIN_DIVISION_PREFIX = /^(городской округ|муниципальный округ)\s+/i;

function toGeoSearchResult(place: NominatimPlace): GeoSearchResult | null {
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const rawCity =
    place.address?.city ??
    place.address?.town ??
    place.address?.village ??
    place.address?.municipality ??
    place.address?.county ??
    place.address?.state;
  if (!rawCity) return null;
  const city = rawCity.replace(ADMIN_DIVISION_PREFIX, '').trim() || rawCity;

  return {
    city,
    country: place.address?.country,
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000,
    displayName: place.display_name,
    type: place.type,
  };
}

function isNominatimSettlement(place: NominatimPlace): boolean {
  return [
    'city',
    'town',
    'village',
    'hamlet',
    'municipality',
    'administrative',
  ].includes(place.type ?? '');
}

function toPhotonGeoSearchResult(
  feature: PhotonFeature,
): GeoSearchResult | null {
  const [lon, lat] = feature.geometry?.coordinates ?? [];
  const properties = feature.properties;
  const rawCity = properties?.city ?? properties?.name;
  if (
    !rawCity ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    !properties
  ) {
    return null;
  }
  const city = rawCity.replace(ADMIN_DIVISION_PREFIX, '').trim() || rawCity;

  const displayName = [
    city,
    properties.county,
    properties.state,
    properties.country,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    city,
    country: properties.country,
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000,
    displayName,
    type: properties.type,
  };
}

function uniqueLocations(results: GeoSearchResult[]): GeoSearchResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.city.trim().toLocaleLowerCase()}:${(
      result.country ?? ''
    )
      .trim()
      .toLocaleLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
