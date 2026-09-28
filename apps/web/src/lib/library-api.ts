// API-клиент сервиса Library. См. docs/service-module-contract.md
import { cookies } from "next/headers";
import type {
  LibraryAdminCategoryDto,
  LibraryAdminDuplicateGroup,
  LibraryAdminEntryListResponse,
  LibraryAdminEntryQuery,
  LibraryAdminStats,
  LibraryCategoryPageDto,
  LibraryCategoryTreeNode,
  LibraryCommentsResponse,
  LibraryCommunityFacet,
  LibraryEntryDto,
  LibraryFeedResponse,
  LibraryPreferencesDto,
  LibrarySectionRequestsState,
  LibraryShlokaDto,
  LibraryShlokaListResponse,
  LibraryShlokaSourceLinesResponse,
  LibraryShlokaSourcesResponse,
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

/**
 * Как просят рубрики экраны просмотра (VED-621): `filtered` — без авторов
 * чужих линий, по тем же правилам, что лента; `lineage` — явная линия из
 * адреса страницы. Без параметров — всё дерево, для админки и форм.
 */
export interface LibraryCategoryView {
  filtered?: boolean;
  lineage?: string | null;
}

/** Строка запроса для `LibraryCategoryView`; пустая — всё дерево. */
export function categoryViewQuery(
  view: LibraryCategoryView | undefined,
): string {
  const params = new URLSearchParams();
  if (view?.filtered) params.set("filtered", "true");
  if (view?.filtered && view.lineage) params.set("lineage", view.lineage);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Всё дерево рубрик: разделов как отдельной сущности больше нет. */
export const getLibraryCategoryTree = (view?: LibraryCategoryView) =>
  libraryGet<LibraryCategoryTreeNode[]>(
    `/library/categories/tree${categoryViewQuery(view)}`,
  );

/** Рубрика с хлебными крошками и прямыми детьми. */
export const getLibraryCategoryPage = (
  slug: string,
  view?: LibraryCategoryView,
) =>
  libraryGet<LibraryCategoryPageDto>(
    `/library/categories/${encodeURIComponent(slug)}${categoryViewQuery(view)}`,
  );

export const getLibraryFeed = (
  params?: Record<string, string | string[] | undefined>,
) =>
  libraryGet<LibraryFeedResponse>(`/library/entries${buildLibraryQuery(params)}`);

/** Организации, от имени которых в каталоге есть материалы, — для фильтра. */
export const getLibraryCommunities = () =>
  libraryGet<LibraryCommunityFacet[]>("/library/entries/communities");

export const getLibraryEntry = (id: string) =>
  libraryGet<LibraryEntryDto>(`/library/entries/${encodeURIComponent(id)}`);

export const getLibraryComments = (entryId: string) =>
  libraryGet<LibraryCommentsResponse>(
    `/library/entries/${encodeURIComponent(entryId)}/comments`,
  );

/** Окно шлоки со стрелками по источнику (VED-386). */
export const getLibraryShloka = (id: string) =>
  libraryGet<LibraryShlokaDto>(`/library/shlokas/${encodeURIComponent(id)}`);

/** Шлоки рубрики по порядку стихов — первая страница окна источника. */
export const getLibraryShlokaList = (categorySlug: string) =>
  libraryGet<LibraryShlokaListResponse>(
    `/library/shlokas?category=${encodeURIComponent(categorySlug)}`,
  );

/** Папки-источники рубрики «Шлоки» (VED-465). */
export const getLibraryShlokaSources = (categorySlug: string) =>
  libraryGet<LibraryShlokaSourcesResponse>(
    `/library/shlokas/sources?category=${encodeURIComponent(categorySlug)}`,
  );

/** Все шлоки одной папки-источника одним списком (VED-465). */
export const getLibraryShlokaSourceLines = (categorySlug: string, key: string) =>
  libraryGet<LibraryShlokaSourceLinesResponse>(
    `/library/shlokas/source?category=${encodeURIComponent(categorySlug)}&key=${encodeURIComponent(key)}`,
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

export const getLibraryAdminCategories = (parentId?: string) =>
  libraryGet<LibraryAdminCategoryDto[]>(
    `/library/admin/categories${parentId ? `?parentId=${encodeURIComponent(parentId)}` : ""}`,
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
