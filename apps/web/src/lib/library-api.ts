// API-клиент сервиса Library. См. docs/service-module-contract.md
import { cookies } from "next/headers";
import type {
  LibraryAdminCategoryDto,
  LibraryAdminDuplicateGroup,
  LibraryAdminEntryListResponse,
  LibraryAdminEntryQuery,
  LibraryAdminStats,
  LibraryCategoryDto,
  LibraryCommentsResponse,
  LibraryEntryDto,
  LibraryFeedResponse,
  LibraryPreferencesDto,
  LibrarySectionDto,
  LibrarySectionRequestsState,
} from "@vedamatch/shared";
import { buildLibraryQuery } from "./library-query";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/** Server-side запрос к Library API с access_token из cookie. null — нет доступа. */
async function libraryGet<T>(path: string): Promise<T | null> {
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

export const getLibrarySections = () =>
  libraryGet<LibrarySectionDto[]>("/library/sections");

export const getLibraryCategories = (sectionSlug: string) =>
  libraryGet<LibraryCategoryDto[]>(
    `/library/categories/section/${encodeURIComponent(sectionSlug)}`,
  );

export const getLibraryFeed = (
  params?: Record<string, string | string[] | undefined>,
) =>
  libraryGet<LibraryFeedResponse>(`/library/entries${buildLibraryQuery(params)}`);

export const getLibraryEntry = (id: string) =>
  libraryGet<LibraryEntryDto>(`/library/entries/${encodeURIComponent(id)}`);

export const getLibraryComments = (entryId: string) =>
  libraryGet<LibraryCommentsResponse>(
    `/library/entries/${encodeURIComponent(entryId)}/comments`,
  );

export const getLibraryPreferences = () =>
  libraryGet<LibraryPreferencesDto>("/library/me/preferences");

// ===== Админка Library. Команды — в library-admin-api.ts =====

export const getLibraryAdminStats = () =>
  libraryGet<LibraryAdminStats>("/library/admin/stats");

export const getLibraryAdminDuplicates = () =>
  libraryGet<LibraryAdminDuplicateGroup[]>("/library/admin/categories/duplicates");

/** Заявки на разделы, ждущие решения администрации. */
export const getLibraryAdminSectionRequests = () =>
  libraryGet<LibrarySectionRequestsState>("/library/admin/section-requests");

export const getLibraryAdminCategories = (sectionId?: string) =>
  libraryGet<LibraryAdminCategoryDto[]>(
    `/library/admin/categories${sectionId ? `?sectionId=${encodeURIComponent(sectionId)}` : ""}`,
  );

export const getLibraryAdminEntries = (query: LibraryAdminEntryQuery) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return libraryGet<LibraryAdminEntryListResponse>(
    `/library/admin/entries${qs ? `?${qs}` : ""}`,
  );
};
