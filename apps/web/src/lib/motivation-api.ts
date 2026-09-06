import { cookies } from "next/headers";
import type {
  MotivationAuthorWatchDto,
  MotivationBookDto,
  MotivationCategoryDto,
  MotivationSettingsDto,
  MotivationTrackDto,
  MotivationFeedResponse,
  MotivationAdminCandidateDto,
  MotivationAdminHealth,
  MotivationPostDto,
  MotivationPreferenceDto,
  MotivationAdminReelFilter,
  MotivationAnalyticsDto,
  MotivationEventDto,
  MotivationAdminReelsResponse,
  MotivationReelDto,
  MotivationSourceWatchDto,
  MotivationStatsDto,
  MotivationAudioDto,} from "@vedamatch/shared";

import { parseJsonBody } from "@/lib/json-body";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

async function motivationGet<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  // 403 приходит, когда роль в базе уже поднята до админской, а в выданном
  // ранее токене она ещё старая: guard читает роль из JWT, а /profile — из БД,
  // поэтому layout пускает на страницу, а эндпоинт отказывает. Токен
  // перевыпустится сам, ронять при этом страницу незачем — отдаём null, и
  // экран показывает свою заглушку.
  if ([401, 403, 404].includes(response.status)) return null;
  if (!response.ok) throw new Error(`API ${path} failed: ${response.status}`);
  return parseJsonBody<T>(await response.text());
}

async function motivationGetPublic<T>(path: string): Promise<T | null> {
  const response = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`API ${path} failed: ${response.status}`);
  return parseJsonBody<T>(await response.text());
}

/** `post` открывает ленту на конкретном рилсе — он придёт первым в списке. */
/** Сколько вдохновений в сервисе — цифра над лентой. */
export const getMotivationStats = () =>
  motivationGet<MotivationStatsDto>("/motivation/stats");

/** Разделы вдохновения для читателя: дерево категорий без пустых веток. */
export const getMotivationCategories = () =>
  motivationGet<MotivationCategoryDto[]>("/motivation/categories");

export const getMotivationFeed = (
  filter: "all" | "favorites" = "all",
  post?: string,
  /** `"random"` — вперемешку, без ярусов «свежее → повтор». */
  order?: "random",
  /** Слаг категории: лента одной папки. */
  category?: string,
) => {
  const query = new URLSearchParams();
  if (filter === "favorites") query.set("filter", "favorites");
  if (post) query.set("post", post);
  if (order) query.set("order", order);
  if (category) query.set("category", category);
  const suffix = query.toString();
  return motivationGet<MotivationFeedResponse>(
    `/motivation/feed${suffix ? `?${suffix}` : ""}`,
  );
};

/** Рилсы, созданные текущим пользователем, новые сверху. */
export const getMyMotivationReels = () =>
  motivationGet<MotivationReelDto[]>("/motivation/reels");

export const getMotivationPreferences = () =>
  motivationGet<MotivationPreferenceDto>("/motivation/preferences");

export const getPublicMotivationPost = (slug: string) =>
  motivationGetPublic<MotivationPostDto>(
    `/motivation/posts/${encodeURIComponent(slug)}`,
  );

export const getAdminMotivationPosts = () =>
  motivationGet<MotivationAdminCandidateDto[]>("/admin/motivation/posts");

export const getAdminMotivationHealth = () =>
  motivationGet<MotivationAdminHealth>("/admin/motivation/health");

export const getAdminMotivationAuthorWatches = () =>
  motivationGet<MotivationAuthorWatchDto[]>("/admin/motivation/authors");

export const getAdminMotivationSourceWatches = () =>
  motivationGet<MotivationSourceWatchDto[]>("/admin/motivation/sources");

export const getAdminMotivationBooks = () =>
  motivationGet<MotivationBookDto[]>("/admin/motivation/books");

/** Рилсы участников для админки: список и счётчики решений ИИ за сегодня. */
export const getAdminMotivationReels = (filter: MotivationAdminReelFilter = "all") =>
  motivationGet<MotivationAdminReelsResponse>(
    `/admin/motivation/reels${filter === "all" ? "" : `?filter=${filter}`}`,
  );

/** Сводка сервиса за окно в днях. */
export const getAdminMotivationAnalytics = (days = 7) =>
  motivationGet<MotivationAnalyticsDto>(`/admin/motivation/analytics?days=${days}`);

/** Справочник праздников для открыток. */
export const getAdminMotivationEvents = () =>
  motivationGet<MotivationEventDto[]>("/admin/motivation/events");

/** Ближайшее событие: по нему подписывается кнопка «Сделать открытку». */
export const getMotivationCurrentEvent = () =>
  motivationGet<MotivationEventDto | null>("/motivation/postcards/event");

export const getAdminMotivationCategories = () =>
  motivationGet<MotivationCategoryDto[]>("/admin/motivation/categories");

/** Фон для чтения — то, что включила редакция. Гостю пустой список. */
export const getMotivationAudio = async () =>
  (await motivationGet<{ items: MotivationAudioDto[] }>("/motivation/audio"))
    ?.items ?? [];

/** Фон для чтения — админский список: включённые и выключенные вместе. */
export const getAdminMotivationAudio = async () =>
  (await motivationGet<{ items: MotivationAudioDto[] }>(
    "/admin/motivation/audio",
  ))?.items ?? [];

export const getMotivationSettings = () =>
  motivationGet<MotivationSettingsDto>("/admin/motivation/settings");

export const getMotivationTracks = () =>
  motivationGet<MotivationTrackDto[]>("/admin/motivation/tracks");
