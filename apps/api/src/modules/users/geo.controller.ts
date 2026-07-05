import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import type { GeoSearchResult } from '@vedamatch/shared';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const DEFAULT_USER_AGENT = 'VedaMatch/1.0 (profile geo search)';

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

@Controller('geo')
export class GeoController {
  @Get('search')
  async search(@Query('q') q: string): Promise<GeoSearchResult[]> {
    const query = String(q ?? '').trim();
    if (query.length < 2) return [];
    if (query.length > 120)
      throw new BadRequestException('Слишком длинный запрос');

    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '6',
      featuretype: 'city',
    });

    const places = await requestNominatim<NominatimPlace[]>(
      `/search?${params}`,
    );
    return places.map(toGeoSearchResult).filter(Boolean) as GeoSearchResult[];
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

async function requestNominatim<T>(path: string): Promise<T> {
  const res = await fetch(`${NOMINATIM_URL}${path}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': process.env.NOMINATIM_USER_AGENT ?? DEFAULT_USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new BadRequestException(`Ошибка геопоиска: ${res.status}`);
  }
  return (await res.json()) as T;
}

function toGeoSearchResult(place: NominatimPlace): GeoSearchResult | null {
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const city =
    place.address?.city ??
    place.address?.town ??
    place.address?.village ??
    place.address?.municipality ??
    place.address?.county ??
    place.address?.state;
  if (!city) return null;

  return {
    city,
    country: place.address?.country,
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000,
    displayName: place.display_name,
    type: place.type,
  };
}
