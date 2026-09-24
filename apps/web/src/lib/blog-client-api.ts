// Браузерный клиент сервиса «Блог-лента» поверх общего apiFetch.
import {
  BLOG_IMAGE_MAX_BYTES,
  BLOG_POST_TEXT_MAX_LENGTH,
  BLOG_POST_TITLE_MAX_LENGTH,
  BLOG_UPLOAD_MAX_TOTAL_BYTES,
  BLOG_VIDEO_MAX_BYTES,
  BLOG_VIDEO_MAX_SECONDS,
} from "@vedamatch/shared";
import type {
  BlogAuthorFeedResponse,
  BlogFavoriteResponse,
  BlogFeedResponse,
  BlogPostCreatedResponse,
  BlogPostDto,
  BlogPostUpdatedResponse,
  BlogSettingsDto,
  CreateBlogPostRequest,
  UpdateBlogPostRequest,
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
  title_too_long: `Заголовок длиннее ${BLOG_POST_TITLE_MAX_LENGTH} знаков.`,
  // С числом, а не «слишком длинный»: до сервера этот отказ теперь доезжает
  // разве что в обход формы — под полем стоит счётчик, который не даёт
  // отправить перебор. А раз доехал, пусть скажет, во что упёрлись (VED-371).
  text_too_long: `Текст длиннее ${BLOG_POST_TEXT_MAX_LENGTH} знаков — столько в пост не помещается.`,
  too_many_images: "Больше вложений в один пост не поместится.",
  too_many_videos: "В пост помещается один ролик — остальные места для фотографий.",
  video_unreadable: "Не удалось прочитать ролик — попробуйте другой файл.",
  video_too_long: `Ролик длиннее ${Math.round(BLOG_VIDEO_MAX_SECONDS / 60)} минут.`,
  upload_too_large: `Все файлы вместе больше ${mb(BLOG_UPLOAD_MAX_TOTAL_BYTES)} МБ — уберите часть или опубликуйте двумя постами.`,
  daily_limit_reached: "На сегодня постов достаточно — продолжите завтра.",
  image_upload_unavailable: "Загрузка фотографий сейчас недоступна.",
  unsupported_type:
    "Такой файл не подходит: нужна фотография JPEG, PNG или WebP либо ролик MP4 или WebM.",
  file_too_large: `Файл слишком большой: фото — до ${mb(BLOG_IMAGE_MAX_BYTES)} МБ, ролик — до ${mb(BLOG_VIDEO_MAX_BYTES)} МБ.`,
  processing_failed: "Не удалось обработать фотографию.",
  post_not_found: "Пост не найден — возможно, его уже удалили.",
  author_not_found: "Участник не найден.",
  not_your_post: "Это чужой пост.",
  repost_not_editable:
    "Репост не правится — поправить можно только исходный пост, и делает это его автор.",
  admin_only: "Доступно только администратору.",
};

function mb(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

export function blogErrorText(code: string): string {
  // Файл больше предела ролика multer обрывает сам, своим текстом, — до
  // сервиса с его кодами такой запрос не доходит.
  if (code === "File too large") return MESSAGES.file_too_large;
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

/** «Избранное» того, кто смотрит (VED-238). */
export function fetchBlogFavorites(cursor?: string): Promise<BlogFeedResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request<BlogFeedResponse>(`/blog/favorites${query}`);
}

export function setBlogFavorite(
  id: string,
  favorited: boolean,
): Promise<BlogFavoriteResponse> {
  return request<BlogFavoriteResponse>(
    `/blog/posts/${encodeURIComponent(id)}/favorite`,
    { method: favorited ? "PUT" : "DELETE" },
  );
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

/**
 * Один пост. Нужен правке (VED-321): карточка в ленте приехала с SSR и
 * могла устареть, а список оставленных картинок, собранный по устаревшему
 * экрану, унёс бы фотографию, добавленную с другого устройства.
 */
export function fetchBlogPost(id: string): Promise<BlogPostDto> {
  return request<BlogPostDto>(`/blog/posts/${encodeURIComponent(id)}`);
}

/**
 * Правка поста (VED-321). Оставленные фотографии перечисляем `keepImageIds`,
 * новые едут файлами тем же запросом — иначе правка остаётся половинчатой.
 * Multipart нужен и без новых файлов, когда картинку убрали: сервер тогда
 * читает `keepImageIds` из полей формы, а не из JSON.
 */
export function updateBlogPost(
  id: string,
  body: UpdateBlogPostRequest,
  files: File[] = [],
): Promise<BlogPostUpdatedResponse> {
  const path = `/blog/posts/${encodeURIComponent(id)}`;
  if (files.length === 0) {
    return request<BlogPostUpdatedResponse>(path, {
      method: "PATCH",
      ...json(body),
    });
  }
  const form = new FormData();
  if (body.title) form.append("title", body.title);
  form.append("text", body.text ?? "");
  if (body.keepImageIds) {
    // Поле обязано доехать даже пустым: на сервере молчание про картинки
    // означает «не трогать их», а пустой список — «убрал все».
    if (body.keepImageIds.length === 0) form.append("keepImageIds", "");
    for (const imageId of body.keepImageIds) {
      form.append("keepImageIds", imageId);
    }
  }
  for (const file of files) form.append("files", file);
  return request<BlogPostUpdatedResponse>(path, {
    method: "PATCH",
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
