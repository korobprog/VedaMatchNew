// Команды админки Library из браузера. Чтение — серверное, в library-api.ts.
import type {
  LibraryAdminCategoryDto,
  LibraryAdminEntryDto,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function command<T>(path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

export const mergeLibraryCategory = (id: string, targetId: string) =>
  command<LibraryAdminCategoryDto>(
    `/library/admin/categories/${encodeURIComponent(id)}/merge`,
    { targetId },
  );

export const removeLibraryEntry = (id: string) =>
  command<LibraryAdminEntryDto>(
    `/library/admin/entries/${encodeURIComponent(id)}/remove`,
  );

export const restoreLibraryEntry = (id: string) =>
  command<LibraryAdminEntryDto>(
    `/library/admin/entries/${encodeURIComponent(id)}/restore`,
  );
