import { cookies } from "next/headers";
import type { ServiceCard, UserProfile } from "@vedamatch/shared";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/** Server-side запрос к API с пробросом access_token из cookie. null — не авторизован. */
async function apiGet<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export const getProfile = () => apiGet<UserProfile>("/users/me");
export const getServices = () => apiGet<ServiceCard[]>("/services");
