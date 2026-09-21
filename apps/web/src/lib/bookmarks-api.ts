// Клиент закладок портала (VED-163). См. docs/service-module-contract.md:
// знание эндпоинтов раздела живёт здесь, авторизация и обновление сессии —
// в общем `http-client`.
import type {
  BookmarkDto,
  BookmarkListResponse,
  CreateBookmarkRequest,
} from "@vedamatch/shared";
import { API_URL, ApiError, apiFetch } from "@/lib/http-client";

export async function listBookmarks(
  signal?: AbortSignal,
): Promise<BookmarkListResponse> {
  const response = await apiFetch(`${API_URL}/bookmarks`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new ApiError("bookmarks", response.status);
  return (await response.json()) as BookmarkListResponse;
}

/**
 * Добавить или переименовать закладку на страницу. Сервер сам решает, что
 * это — новая строка или та же самая: `path` уникален на человека.
 */
export async function addBookmark(
  body: CreateBookmarkRequest,
): Promise<BookmarkDto> {
  const response = await apiFetch(`${API_URL}/bookmarks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(await reason(response), response.status);
  return (await response.json()) as BookmarkDto;
}

export async function removeBookmark(id: string): Promise<void> {
  const response = await apiFetch(`${API_URL}/bookmarks/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new ApiError(await reason(response), response.status);
}

/**
 * Сообщение сервера, если оно там есть: у закладок всего две причины отказа
 * (адрес не портальный, лимит), и обе человеку понятны как есть.
 */
async function reason(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body?.message === "string" && body.message) return body.message;
  } catch {
    // Тело не JSON — обойдёмся общей формулировкой.
  }
  return "Не вышло. Попробуйте ещё раз.";
}
