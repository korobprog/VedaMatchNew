// Команды админки Library из браузера. Чтение — серверное, в library-api.ts.
import type {
  ApplyLibraryAuthorLineageResponse,
  CreateLibrarySectionRequestBody,
  LibraryAdminCategoryDto,
  LibraryAdminEntryDto,
  LibrarySectionRequestDto,
  LineageId,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";

const API_URL = apiBase();

async function command<T>(
  path: string,
  body?: unknown,
  method: "POST" | "PATCH" = "POST",
): Promise<T> {
  const response = await apiFetch(`${API_URL}${path}`, {
    method,
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

/** Заявку на раздел шлёт обычный участник, а не админ — но команда та же. */
export const requestLibrarySection = (body: CreateLibrarySectionRequestBody) =>
  command<LibrarySectionRequestDto>("/library/section-requests", body);

export const decideLibrarySectionRequest = (
  id: string,
  action: "approve" | "reject",
  comment?: string,
) =>
  command<LibrarySectionRequestDto>(
    `/library/admin/section-requests/${encodeURIComponent(id)}/decide`,
    { action, comment: comment ?? null },
  );

/** Линия автора (VED-548): запоминается у рубрики, материалы не трогает. */
export const setLibraryCategoryLineage = (
  id: string,
  lineage: LineageId | null,
) =>
  command<{ id: string; lineage: LineageId | null }>(
    `/library/admin/categories/${encodeURIComponent(id)}/lineage`,
    { lineage },
    "PATCH",
  );

/** «Применить ко всем материалам автора» — линия рубрики всему поддереву. */
export const applyLibraryAuthorLineage = (id: string) =>
  command<ApplyLibraryAuthorLineageResponse>(
    `/library/admin/categories/${encodeURIComponent(id)}/lineage/apply`,
  );

/** Кнопка «Линия» на карточке материала (VED-561). */
export const setLibraryEntryLineage = (id: string, lineage: LineageId | null) =>
  command<{ id: string; lineage: LineageId | null }>(
    `/library/admin/entries/${encodeURIComponent(id)}/lineage`,
    { lineage },
    "PATCH",
  );
