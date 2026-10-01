// Серверный клиент сервиса «Блог-лента». См. docs/service-module-contract.md
//
// Отдельный файл от браузерного `blog-client-api.ts`: `next/headers` нельзя
// тянуть в модуль, который импортируют клиентские компоненты, — сборка падает.
import { cookies } from "next/headers";
import { cache } from "react";
import type {
  BlogAlbumResponse,
  BlogAuthorFeedResponse,
  BlogAuthorFilesResponse,
  BlogFeedRequestsResponse,
  BlogFeedResponse,
  BlogHomeFeedResponse,
  BlogPostDto,
  BlogPublicPostDto,
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

/**
 * Запрос без входа (VED-718): превью ссылки и тизер гостя спрашивают API
 * публичным методом, cookie для него не нужны. null — поста нет или он не из
 * общей ленты: страница покажет приглашение войти, а превью останется без
 * картинки, но уже без карточки портала.
 */
async function blogGetPublic<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    // Nest отдаёт пустое тело контроллерам, вернувшим null (см. lib/api.ts).
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Пост без входа (VED-718) — для `generateMetadata` и тизера гостя. В
 * React.cache: оба зовут его в одном рендерe, запрос уходит один (как
 * `getServiceCard` в lib/api.ts).
 */
export const getPublicBlogPost = cache((id: string) =>
  blogGetPublic<BlogPublicPostDto>(
    `/blog/public/posts/${encodeURIComponent(id)}`,
  ),
);

export function getBlogHomeFeed(): Promise<BlogHomeFeedResponse | null> {
  // Карусель на главной листает больше постов, чем полоса в приложении,
  // которой эндпоинт по умолчанию отдаёт четыре (VED-238).
  return blogGet<BlogHomeFeedResponse>("/blog/home?view=carousel");
}

/** Фильтры читателя (VED-590, VED-596): категория и линия из адреса ленты. */
export interface BlogFeedFilterParams {
  category?: string | null;
  lineage?: string | null;
  q?: string | null;
  author?: string | null;
}

function filterSuffix(filters: BlogFeedFilterParams): string {
  const query = new URLSearchParams();
  if (filters.category) query.set("category", filters.category);
  if (filters.lineage) query.set("lineage", filters.lineage);
  if (filters.q) query.set("q", filters.q);
  if (filters.author) query.set("author", filters.author);
  return query.toString();
}

export function getBlogFeed(
  scope: "current" | "all" = "all",
  filters: BlogFeedFilterParams = {},
): Promise<BlogFeedResponse | null> {
  const suffix = filterSuffix(filters);
  return blogGet<BlogFeedResponse>(
    `/blog/feed?scope=${scope}${suffix ? `&${suffix}` : ""}`,
  );
}

export function getBlogAuthorFeed(
  authorId: string,
): Promise<BlogAuthorFeedResponse | null> {
  return blogGet<BlogAuthorFeedResponse>(
    `/blog/authors/${encodeURIComponent(authorId)}`,
  );
}

/** Файлы личной страницы; null — нет автора, не авторизован или сбой. */
export function getBlogAuthorFiles(
  authorId: string,
): Promise<BlogAuthorFilesResponse | null> {
  return blogGet<BlogAuthorFilesResponse>(
    `/blog/authors/${encodeURIComponent(authorId)}/files`,
  );
}

/** Фотоальбом личной страницы; null — нет автора, не авторизован или сбой. */
export function getBlogAuthorAlbum(
  authorId: string,
): Promise<BlogAlbumResponse | null> {
  return blogGet<BlogAlbumResponse>(
    `/blog/authors/${encodeURIComponent(authorId)}/photos`,
  );
}

export function getBlogPost(id: string): Promise<BlogPostDto | null> {
  return blogGet<BlogPostDto>(`/blog/posts/${encodeURIComponent(id)}`);
}

export function getBlogFavorites(
  filters: BlogFeedFilterParams = {},
): Promise<BlogFeedResponse | null> {
  const suffix = filterSuffix(filters);
  return blogGet<BlogFeedResponse>(
    `/blog/favorites${suffix ? `?${suffix}` : ""}`,
  );
}

/** null и для не-администратора: эндпоинт отвечает ему 403. */
export function getBlogSettings(): Promise<BlogSettingsDto | null> {
  return blogGet<BlogSettingsDto>("/blog/admin/settings");
}

/** Очередь «предложено в ленту» (VED-686); null и для не-администратора. */
export function getBlogFeedRequests(): Promise<BlogFeedRequestsResponse | null> {
  return blogGet<BlogFeedRequestsResponse>("/blog/admin/feed-requests");
}
