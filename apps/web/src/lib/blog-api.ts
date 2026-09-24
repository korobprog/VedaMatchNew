// Серверный клиент сервиса «Блог-лента». См. docs/service-module-contract.md
//
// Отдельный файл от браузерного `blog-client-api.ts`: `next/headers` нельзя
// тянуть в модуль, который импортируют клиентские компоненты, — сборка падает.
import { cookies } from "next/headers";
import type {
  BlogAuthorFeedResponse,
  BlogFeedResponse,
  BlogHomeFeedResponse,
  BlogPostDto,
  BlogSettingsDto,
} from "@vedamatch/shared";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/** null — не авторизован или сервис недоступен. Молча, как в notices-api. */
async function blogGet<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // Упавший сервис обязан убрать ленту с главной, а не саму главную.
    return null;
  }
}

export function getBlogHomeFeed(): Promise<BlogHomeFeedResponse | null> {
  // Карусель на главной листает больше постов, чем полоса в приложении,
  // которой эндпоинт по умолчанию отдаёт четыре (VED-238).
  return blogGet<BlogHomeFeedResponse>("/blog/home?view=carousel");
}

export function getBlogFeed(
  scope: "current" | "all" = "all",
): Promise<BlogFeedResponse | null> {
  return blogGet<BlogFeedResponse>(`/blog/feed?scope=${scope}`);
}

export function getBlogAuthorFeed(
  authorId: string,
): Promise<BlogAuthorFeedResponse | null> {
  return blogGet<BlogAuthorFeedResponse>(
    `/blog/authors/${encodeURIComponent(authorId)}`,
  );
}

export function getBlogPost(id: string): Promise<BlogPostDto | null> {
  return blogGet<BlogPostDto>(`/blog/posts/${encodeURIComponent(id)}`);
}

export function getBlogFavorites(): Promise<BlogFeedResponse | null> {
  return blogGet<BlogFeedResponse>("/blog/favorites");
}

/** null и для не-администратора: эндпоинт отвечает ему 403. */
export function getBlogSettings(): Promise<BlogSettingsDto | null> {
  return blogGet<BlogSettingsDto>("/blog/admin/settings");
}
