// API-клиент сервиса Union. См. docs/service-module-contract.md
import { cookies } from "next/headers";
import type { UnionProfileState, UnionRecommendation } from "@vedamatch/shared";

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
export const getUnionRecommendations = () =>
  unionGet<UnionRecommendation[]>("/union/recommendations");
export const getUnionUserCard = (id: string) =>
  unionGet<UnionRecommendation>(`/union/users/${encodeURIComponent(id)}`);
