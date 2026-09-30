import {
  TRAVEL_MAP_PLACE_KIND_OPTIONS,
  TRAVEL_MAP_PLACE_GROUPS,
  type TravelMapPlaceGroup,
  type TravelMapPlaceKind,
} from "@vedamatch/shared";

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MapFilters {
  kinds: TravelMapPlaceKind[];
  q: string;
  lineage: string;
  communities: boolean;
  /** Слой объектов ночлега. */
  stays: boolean;
}

const KIND_IDS = new Set<string>(TRAVEL_MAP_PLACE_KIND_OPTIONS.map((o) => o.id));

/** Виды группы в порядке справочника. */
export function kindsOfGroup(group: TravelMapPlaceGroup): TravelMapPlaceKind[] {
  return TRAVEL_MAP_PLACE_KIND_OPTIONS.filter((o) => o.group === group).map(
    (o) => o.id,
  );
}

/** Группа выбрана, если выбраны все её виды. */
export function isGroupSelected(
  kinds: readonly TravelMapPlaceKind[],
  group: TravelMapPlaceGroup,
): boolean {
  const own = kindsOfGroup(group);
  return own.length > 0 && own.every((kind) => kinds.includes(kind));
}

/** Нажатие на чип группы: включает или выключает все её виды. */
export function toggleGroup(
  kinds: readonly TravelMapPlaceKind[],
  group: TravelMapPlaceGroup,
): TravelMapPlaceKind[] {
  const own = kindsOfGroup(group);
  if (isGroupSelected(kinds, group)) {
    return kinds.filter((kind) => !own.includes(kind));
  }
  const next = new Set<TravelMapPlaceKind>([...kinds, ...own]);
  return TRAVEL_MAP_PLACE_KIND_OPTIONS.map((o) => o.id).filter((id) =>
    next.has(id),
  );
}

/** Группы, целиком покрытые видами: для подсветки чипов. */
export function selectedGroups(
  kinds: readonly TravelMapPlaceKind[],
): TravelMapPlaceGroup[] {
  return TRAVEL_MAP_PLACE_GROUPS.filter((g) => isGroupSelected(kinds, g));
}

export function parseKinds(value: string | null | undefined): TravelMapPlaceKind[] {
  if (!value) return [];
  const seen = new Set<string>();
  for (const part of value.split(",")) {
    const id = part.trim();
    if (KIND_IDS.has(id)) seen.add(id);
  }
  return TRAVEL_MAP_PLACE_KIND_OPTIONS.map((o) => o.id).filter((id) =>
    seen.has(id),
  );
}

export function parseFilters(params: {
  get(name: string): string | null;
}): MapFilters {
  const groupParam = params.get("group");
  const kinds = parseKinds(params.get("kinds"));
  const groupKinds =
    kinds.length === 0 && groupParam
      ? groupParam
          .split(",")
          .filter((g): g is TravelMapPlaceGroup =>
            (TRAVEL_MAP_PLACE_GROUPS as readonly string[]).includes(g),
          )
          .reduce<TravelMapPlaceKind[]>(
            (acc, g) => toggleGroup(acc, g),
            [],
          )
      : [];
  return {
    kinds: kinds.length ? kinds : groupKinds,
    q: (params.get("q") ?? "").slice(0, 120),
    lineage: params.get("lineage") ?? "",
    communities: params.get("communities") !== "0",
    stays: params.get("stays") !== "0",
  };
}

/** Собирает строку запроса страницы; пустые значения не пишет. */
export function buildFilterParams(
  filters: MapFilters,
  extra: Record<string, string | undefined> = {},
): string {
  const query = new URLSearchParams();
  if (filters.kinds.length) query.set("kinds", filters.kinds.join(","));
  if (filters.q.trim()) query.set("q", filters.q.trim());
  if (filters.lineage) query.set("lineage", filters.lineage);
  if (!filters.communities) query.set("communities", "0");
  if (!filters.stays) query.set("stays", "0");
  for (const [key, value] of Object.entries(extra)) {
    if (value) query.set(key, value);
  }
  return query.toString();
}

export function inBounds(
  point: { lat: number; lng: number },
  bounds: MapBounds,
): boolean {
  const inLat = point.lat >= bounds.south && point.lat <= bounds.north;
  // Кадр может пересекать антимеридиан: тогда запад больше востока.
  const inLng =
    bounds.west <= bounds.east
      ? point.lng >= bounds.west && point.lng <= bounds.east
      : point.lng >= bounds.west || point.lng <= bounds.east;
  return inLat && inLng;
}
