// API-клиент портальных общин. Общины — инфраструктура, а не сервис, поэтому
// клиент лежит рядом с портальными, а не в папке сервиса; см.
// docs/service-module-contract.md.
import type {
  AdminCommunityDecisionRequest,
  AdminCommunityListResponse,
  CommunityDto,
  CommunityMapResponse,
  CommunityMembersResponse,
  CommunityMembershipDto,
  CommunitySearchFilters,
  CommunitySearchResponse,
  CommunityTransferDto,
  CreateCommunityRequest,
  UpdateCommunityRequest,
  UpdateMemberRequest,
  UpdateMembershipRequest,
  MyCommunitiesResponse,
} from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class CommunitiesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    // Бэкенд присылает готовый русский текст ошибки — он точнее кода статуса.
    const message = await res
      .json()
      .then((body: { message?: string | string[] }) =>
        Array.isArray(body.message) ? body.message.join(", ") : body.message,
      )
      .catch(() => undefined);
    throw new CommunitiesApiError(
      message ?? `Запрос не выполнен (${res.status})`,
      res.status,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function buildCommunitiesQuery(
  filters: CommunitySearchFilters,
): string {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.city?.trim()) params.set("city", filters.city.trim());
  if (filters.country?.trim()) params.set("country", filters.country.trim());
  if (filters.kinds?.length) params.set("kinds", filters.kinds.join(","));
  if (filters.verifiedOnly) params.set("verifiedOnly", "true");
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const searchCommunities = (
  filters: CommunitySearchFilters,
  signal?: AbortSignal,
) =>
  request<CommunitySearchResponse>(
    `/communities${buildCommunitiesQuery(filters)}`,
    { method: "GET", signal },
  );

export const getCommunitiesMap = (
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number },
  signal?: AbortSignal,
) => {
  const params = new URLSearchParams(
    Object.entries(bbox).map(([key, value]) => [key, String(value)]),
  );
  return request<CommunityMapResponse>(`/communities/map?${params}`, {
    method: "GET",
    signal,
  });
};

export const getCommunity = (slug: string, signal?: AbortSignal) =>
  request<CommunityDto>(`/communities/${encodeURIComponent(slug)}`, {
    method: "GET",
    signal,
  });

export const getMyCommunities = (signal?: AbortSignal) =>
  request<MyCommunitiesResponse>("/communities/me", { method: "GET", signal });

export const createCommunity = (body: CreateCommunityRequest) =>
  request<CommunityDto>("/communities", { method: "POST", ...json(body) });

export const updateCommunity = (id: string, body: UpdateCommunityRequest) =>
  request<CommunityDto>(`/communities/${id}`, { method: "PATCH", ...json(body) });

export const getCommunityMembers = (
  id: string,
  page = 1,
  signal?: AbortSignal,
) =>
  request<CommunityMembersResponse>(`/communities/${id}/members?page=${page}`, {
    method: "GET",
    signal,
  });

export const joinCommunity = (id: string, message?: string) =>
  request<CommunityMembershipDto>(`/communities/${id}/join`, {
    method: "POST",
    ...json({ message: message ?? null }),
  });

export const leaveCommunity = (id: string) =>
  request<void>(`/communities/${id}/members/me`, { method: "DELETE" });

export const updateMyMembership = (
  id: string,
  body: UpdateMembershipRequest,
) =>
  request<CommunityMembershipDto>(`/communities/${id}/members/me`, {
    method: "PUT",
    ...json(body),
  });

export const respondToMember = (
  id: string,
  userId: string,
  accept: boolean,
) =>
  request<CommunityMembershipDto>(
    `/communities/${id}/members/${userId}/respond`,
    { method: "POST", ...json({ accept }) },
  );

export const updateMember = (
  id: string,
  userId: string,
  body: UpdateMemberRequest,
) =>
  request<CommunityMembershipDto>(`/communities/${id}/members/${userId}`, {
    method: "PUT",
    ...json(body),
  });

export const removeMember = (id: string, userId: string) =>
  request<void>(`/communities/${id}/members/${userId}`, { method: "DELETE" });

export const transferOwnership = (id: string, toUserId: string) =>
  request<CommunityTransferDto>(`/communities/${id}/transfer`, {
    method: "POST",
    ...json({ toUserId }),
  });

export const getIncomingTransfers = (signal?: AbortSignal) =>
  request<CommunityTransferDto[]>("/communities/transfers/incoming", {
    method: "GET",
    signal,
  });

export const respondToTransfer = (id: string, accept: boolean) =>
  request<CommunityTransferDto>(`/communities/transfers/${id}/respond`, {
    method: "POST",
    ...json({ accept }),
  });

// ===== Администрация портала =====

export const getAdminCommunities = (status = "pending", page = 1) =>
  request<AdminCommunityListResponse>(
    `/admin/communities?status=${status}&page=${page}`,
    { method: "GET" },
  );

export const decideCommunity = (
  id: string,
  body: AdminCommunityDecisionRequest,
) =>
  request<CommunityDto>(`/admin/communities/${id}/decide`, {
    method: "POST",
    ...json(body),
  });
