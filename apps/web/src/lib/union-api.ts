// API-клиент сервиса Union. См. docs/service-module-contract.md
import { cookies } from "next/headers";
import type {
  UnionArchiveListResponse,
  UnionChatState,
  UnionChatsState,
  UnionConnectionCounts,
  UnionConnectionRequestsState,
  UnionAdminProfileDto,
  UnionAdminProfileListResponse,
  UnionAdminProfileQuery,
  UnionAdminStats,
  UnionProfileState,
  UnionRecommendation,
  UnionRecommendationsResponse,
  UserBlocksState,
} from "@vedamatch/shared";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/** Server-side запрос к Union API с access_token из cookie. null — не авторизован. */
async function unionGet<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) return null;
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export const getUnionProfileState = () =>
  unionGet<UnionProfileState>("/union/profile");
export const getUnionRecommendations = (
  params?: Record<string, string | string[] | undefined>,
) => {
  const query = toQueryString(params);
  return unionGet<UnionRecommendationsResponse>(
    `/union/recommendations${query}`,
  );
};
export const getUnionUserCard = (id: string) =>
  unionGet<UnionRecommendation>(`/union/users/${encodeURIComponent(id)}`);
export const getUnionConnectionRequests = () =>
  unionGet<UnionConnectionRequestsState>("/union/connection-requests");
export const getUnionConnectionCounts = () =>
  unionGet<UnionConnectionCounts>("/union/connection-requests/counts");
export const getUnionBlocks = () => unionGet<UserBlocksState>("/union/blocks");
export const getUnionArchive = () =>
  unionGet<UnionArchiveListResponse>("/union/archive");
export const getUnionChats = () => unionGet<UnionChatsState>("/union/chats");
export const getUnionChat = (id: string) =>
  unionGet<UnionChatState>(`/union/chats/${encodeURIComponent(id)}`);

// ===== Админка Union. Команды над анкетами — в union-admin-api.ts =====

export const getUnionAdminStats = () =>
  unionGet<UnionAdminStats>("/union/admin/stats");

export const getUnionAdminProfiles = (query: UnionAdminProfileQuery) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return unionGet<UnionAdminProfileListResponse>(
    `/union/admin/profiles${qs ? `?${qs}` : ""}`,
  );
};

export const getUnionAdminProfile = (userId: string) =>
  unionGet<UnionAdminProfileDto>(
    `/union/admin/profiles/${encodeURIComponent(userId)}`,
  );

export function toQueryString(
  params?: Record<string, string | string[] | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    // Цели приходят повторяющимся параметром: `set` оставил бы одну.
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item) query.append(key, item);
    }
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}
