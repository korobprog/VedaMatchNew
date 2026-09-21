// Браузерный клиент сервиса «Блог-лента» поверх общего apiFetch.
import type {
  BlogAuthorFeedResponse,
  BlogFeedResponse,
  BlogPostCreatedResponse,
  BlogPostDto,
  BlogSettingsDto,
  CreateBlogPostRequest,
} from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";

export class BlogApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BlogApiError";
  }
}

/**
 * Коды сервиса — человеческим языком. Незнакомый код показываем как есть
 * только в крайнем случае: на экране он всё равно читается как поломка.
 */
const MESSAGES: Record<string, string> = {
  post_empty: "Напишите что-нибудь или добавьте фотографию.",
  title_too_long: "Заголовок слишком длинный.",
  text_too_long: "Текст слишком длинный.",
  too_many_images: "Больше фотографий в один пост не поместится.",
  daily_limit_reached: "На сегодня постов достаточно — продолжите завтра.",
  image_upload_unavailable: "Загрузка фотографий сейчас недоступна.",
  unsupported_type: "Такой файл не подходит: нужен JPEG, PNG или WebP.",
  file_too_large: "Файл слишком большой.",
  processing_failed: "Не удалось обработать фотографию.",
  post_not_found: "Пост не найден — возможно, его уже удалили.",
  author_not_found: "Участник не найден.",
  not_your_post: "Это чужой пост.",
  admin_only: "Доступно только администратору.",
};

export function blogErrorText(code: string): string {
  return MESSAGES[code] ?? "Не получилось. Попробуйте ещё раз.";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    const code = await res
      .json()
      .then((body: { message?: string | string[] }) =>
        Array.isArray(body.message) ? body.message[0] : body.message,
      )
      .catch(() => undefined);
    throw new BlogApiError(
      blogErrorText(code ?? ""),
      code ?? "unknown",
      res.status,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function json(body: unknown): RequestInit {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function fetchBlogFeed(
  scope: "current" | "all",
  cursor?: string,
): Promise<BlogFeedResponse> {
  const query = new URLSearchParams({ scope });
  if (cursor) query.set("cursor", cursor);
  return request<BlogFeedResponse>(`/blog/feed?${query.toString()}`);
}

export function fetchBlogAuthorFeed(
  authorId: string,
  cursor?: string,
): Promise<BlogAuthorFeedResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request<BlogAuthorFeedResponse>(
    `/blog/authors/${encodeURIComponent(authorId)}${query}`,
  );
}

/**
 * Публикация. Картинки уезжают тем же запросом: FormData, когда файлы есть,
 * и обычный JSON, когда их нет. Content-Type у multipart не задаём — браузер
 * сам поставит boundary.
 */
export function createBlogPost(
  body: CreateBlogPostRequest,
  files: File[] = [],
): Promise<BlogPostCreatedResponse> {
  if (files.length === 0) {
    return request<BlogPostCreatedResponse>("/blog/posts", {
      method: "POST",
      ...json(body),
    });
  }
  const form = new FormData();
  if (body.title) form.append("title", body.title);
  form.append("text", body.text ?? "");
  for (const file of files) form.append("files", file);
  return request<BlogPostCreatedResponse>("/blog/posts", {
    method: "POST",
    body: form,
  });
}

export function repostBlogPost(
  id: string,
  body: CreateBlogPostRequest,
): Promise<BlogPostDto> {
  return request<BlogPostDto>(`/blog/posts/${encodeURIComponent(id)}/repost`, {
    method: "POST",
    ...json(body),
  });
}

export function deleteBlogPost(id: string): Promise<void> {
  return request<void>(`/blog/posts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function setBlogPostLifetime(
  id: string,
  hours: number | null,
): Promise<BlogPostDto> {
  return request<BlogPostDto>(
    `/blog/admin/posts/${encodeURIComponent(id)}/lifetime`,
    { method: "PATCH", ...json({ hours }) },
  );
}

export function setBlogPostPinned(
  id: string,
  pinned: boolean,
): Promise<BlogPostDto> {
  return request<BlogPostDto>(
    `/blog/admin/posts/${encodeURIComponent(id)}/pin`,
    { method: "PATCH", ...json({ pinned }) },
  );
}

export function updateBlogSettings(
  feedLifetimeHours: number,
): Promise<BlogSettingsDto> {
  return request<BlogSettingsDto>("/blog/admin/settings", {
    method: "PATCH",
    ...json({ feedLifetimeHours }),
  });
}
