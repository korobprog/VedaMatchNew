import { cookies } from "next/headers";
import type {
  MotivationFeedResponse,
  MotivationAdminCandidateDto,
  MotivationPostDto,
  MotivationPreferenceDto,
} from "@vedamatch/shared";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

async function motivationGet<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 404) return null;
  if (!response.ok) throw new Error(`API ${path} failed: ${response.status}`);
  return (await response.json()) as T;
}

async function motivationGetPublic<T>(path: string): Promise<T | null> {
  const response = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`API ${path} failed: ${response.status}`);
  return (await response.json()) as T;
}

export const getMotivationFeed = (filter: "all" | "favorites" = "all") =>
  motivationGet<MotivationFeedResponse>(
    `/motivation/feed${filter === "favorites" ? "?filter=favorites" : ""}`,
  );

export const getMotivationPreferences = () =>
  motivationGet<MotivationPreferenceDto>("/motivation/preferences");

export const getPublicMotivationPost = (slug: string) =>
  motivationGetPublic<MotivationPostDto>(
    `/motivation/posts/${encodeURIComponent(slug)}`,
  );

export const getAdminMotivationPosts = () =>
  motivationGet<MotivationAdminCandidateDto[]>("/admin/motivation/posts");
