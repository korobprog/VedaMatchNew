import { BadRequestException } from '@nestjs/common';
import {
  LINEAGES,
  TRAVEL_MAP_PLACE_KINDS,
  type LineageId,
  type TravelMapPlaceKind,
  type TravelMapPlaceStatus,
  type TravelMapReportStatus,
} from '@vedamatch/shared';

export interface PlacesQuery {
  bbox: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  } | null;
  kinds: TravelMapPlaceKind[];
  q: string | null;
  lineage: LineageId | null;
  communities: boolean;
  stays: boolean;
}

export interface AdminPlacesQuery {
  status: TravelMapPlaceStatus | null;
  verified: boolean | null;
  q: string | null;
}

export interface AdminReportsQuery {
  /** `null` — все жалобы. */
  status: TravelMapReportStatus | null;
}

const Q_MAX = 100;

type Raw = Record<string, unknown> | undefined;

function str(raw: Raw, key: string): string | undefined {
  const value = raw?.[key];
  return typeof value === 'string' ? value : undefined;
}

function parseQ(raw: Raw): string | null {
  const q = str(raw, 'q')?.trim();
  return q ? q.slice(0, Q_MAX) : null;
}

/**
 * Рамка видимой области: четыре границы или ни одной. Половина рамки —
 * ошибка клиента, а не «весь мир», иначе баг вёрстки молча тянул бы всё.
 */
function parseBbox(raw: Raw): PlacesQuery['bbox'] {
  const keys = ['minLat', 'maxLat', 'minLng', 'maxLng'] as const;
  const given = keys.filter((key) => str(raw, key)?.trim());
  if (given.length === 0) return null;
  if (given.length !== keys.length) {
    throw new BadRequestException(
      'Рамка карты задаётся четырьмя границами: minLat, maxLat, minLng, maxLng',
    );
  }
  const values = keys.map((key) => Number(str(raw, key)));
  if (values.some((value) => !Number.isFinite(value))) {
    throw new BadRequestException('Границы рамки карты должны быть числами');
  }
  const [minLat, maxLat, minLng, maxLng] = values;
  if (minLat > maxLat || minLng > maxLng) {
    throw new BadRequestException('Границы рамки карты перепутаны');
  }
  return { minLat, maxLat, minLng, maxLng };
}

export function parsePlacesQuery(query: Raw): PlacesQuery {
  const kinds = (str(query, 'kinds') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is TravelMapPlaceKind =>
      (TRAVEL_MAP_PLACE_KINDS as readonly string[]).includes(item),
    );
  const lineageRaw = str(query, 'lineage')?.trim();
  const lineage =
    lineageRaw && LINEAGES.some((item) => item.id === lineageRaw)
      ? (lineageRaw as LineageId)
      : null;
  return {
    bbox: parseBbox(query),
    kinds: [...new Set(kinds)],
    q: parseQ(query),
    lineage,
    communities: str(query, 'communities') !== '0',
    stays: str(query, 'stays') !== '0',
  };
}

export function parseAdminPlacesQuery(query: Raw): AdminPlacesQuery {
  const status = str(query, 'status');
  const verified = str(query, 'verified');
  return {
    status: status === 'active' || status === 'hidden' ? status : null,
    verified: verified === '1' ? true : verified === '0' ? false : null,
    q: parseQ(query),
  };
}

export function parseAdminReportsQuery(query: Raw): AdminReportsQuery {
  const status = str(query, 'status');
  // Разбирают обычно открытые жалобы, поэтому без параметра — они;
  // `all` — все подряд.
  if (status === 'all') return { status: null };
  return { status: status === 'resolved' ? 'resolved' : 'open' };
}
