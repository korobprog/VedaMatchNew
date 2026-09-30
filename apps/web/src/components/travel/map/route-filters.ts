import {
  TRAVEL_MAP_ROUTE_KINDS,
  type TravelMapRouteKind,
} from "@vedamatch/shared";

export interface RouteFilters {
  kinds: TravelMapRouteKind[];
  q: string;
}

export function parseRouteFilters(params: {
  get(name: string): string | null;
}): RouteFilters {
  const raw = (params.get("kinds") ?? "").split(",").map((s) => s.trim());
  return {
    kinds: TRAVEL_MAP_ROUTE_KINDS.filter((kind) => raw.includes(kind)),
    q: (params.get("q") ?? "").slice(0, 120),
  };
}

export function buildRouteFilterParams(filters: RouteFilters): string {
  const query = new URLSearchParams();
  if (filters.kinds.length) query.set("kinds", filters.kinds.join(","));
  if (filters.q.trim()) query.set("q", filters.q.trim());
  return query.toString();
}

export function toggleRouteKind(
  kinds: readonly TravelMapRouteKind[],
  kind: TravelMapRouteKind,
): TravelMapRouteKind[] {
  return TRAVEL_MAP_ROUTE_KINDS.filter((k) =>
    k === kind ? !kinds.includes(k) : kinds.includes(k),
  );
}
