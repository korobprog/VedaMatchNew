// API-клиент сервиса Market. См. docs/service-module-contract.md
import { cookies } from "next/headers";
import type {
  AdminMarketReportListResponse,
  MarketCartDto,
  MarketCategoryDto,
  MarketChatState,
  MarketChatsState,
  MarketCommentsResponse,
  MarketListingDto,
  MarketOrderDto,
  MarketOrderListResponse,
  MarketReviewDto,
  MarketReviewListResponse,
  MarketSubscriptionDto,
  MarketListingFeedResponse,
  MarketPreferencesDto,
  MarketSectionDto,
  MarketShelfDto,
  MarketShopDto,
  MarketShopListResponse,
  MarketShopStatsDto,
} from "@vedamatch/shared";
import { buildMarketQuery } from "./market-query";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/**
 * Витрина публичной страницы сервиса. Без cookie: её запрашивает гость, а
 * лента Рынка открыта и ему. `no-store` обязателен — ссылки на фото
 * подписаны и живут минуты, закэшированная страница отдала бы посетителю
 * картинки с истёкшей подписью.
 *
 * Молчание API не имеет права ронять страницу сервиса: `null` здесь значит
 * «показать запасные карточки», и решает это `showcaseCards`.
 */
export async function getMarketShowcase(): Promise<MarketListingFeedResponse | null> {
  try {
    const res = await fetch(`${API_URL}/market/listings`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as MarketListingFeedResponse;
  } catch {
    return null;
  }
}

/** Server-side запрос к Market API с access_token из cookie. null — нет доступа. */
async function marketGet<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) return null;
  if (res.status === 403) return null;
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);

  // Nest сериализует возвращённый из контроллера `null` в пустое тело с кодом
  // 200, а не в строку "null" — `res.json()` на нём падает. Так отвечает
  // `GET /market/shops/me`, когда магазина у пользователя ещё нет.
  const body = await res.text();
  if (!body) return null;
  return JSON.parse(body) as T;
}

export const getMarketSections = () =>
  marketGet<MarketSectionDto[]>("/market/sections");

export const getMarketCategories = (sectionSlug: string) =>
  marketGet<MarketCategoryDto[]>(
    `/market/categories/section/${encodeURIComponent(sectionSlug)}`,
  );

export const getMarketListings = (
  params?: Record<string, string | string[] | undefined>,
) =>
  marketGet<MarketListingFeedResponse>(
    `/market/listings${buildMarketQuery(params)}`,
  );

export const getMarketListing = (id: string) =>
  marketGet<MarketListingDto>(`/market/listings/${encodeURIComponent(id)}`);

export const getMarketShops = (
  params?: Record<string, string | string[] | undefined>,
) => marketGet<MarketShopListResponse>(`/market/shops${buildMarketQuery(params)}`);

export const getMarketShop = (slug: string) =>
  marketGet<MarketShopDto>(`/market/shops/${encodeURIComponent(slug)}`);

export const getMarketShopListings = (
  slug: string,
  params?: Record<string, string | string[] | undefined>,
) =>
  marketGet<MarketListingFeedResponse>(
    `/market/shops/${encodeURIComponent(slug)}/listings${buildMarketQuery(params)}`,
  );

export const getMarketShopShelves = (slug: string) =>
  marketGet<MarketShelfDto[]>(
    `/market/shops/${encodeURIComponent(slug)}/shelves`,
  );

/** null — у пользователя ещё нет магазина. */
export const getMyMarketShop = () => marketGet<MarketShopDto>("/market/shops/me");

export const getMarketShopStats = (shopId: string) =>
  marketGet<MarketShopStatsDto>(
    `/market/shops/${encodeURIComponent(shopId)}/stats`,
  );

export const getMarketFavorites = (
  params?: Record<string, string | string[] | undefined>,
) =>
  marketGet<MarketListingFeedResponse>(
    `/market/favorites${buildMarketQuery(params)}`,
  );

export const getMarketPreferences = () =>
  marketGet<MarketPreferencesDto>("/market/me/preferences");

// ===== Корзина, заявки, чат (фаза 2) =====

export const getMarketCart = () => marketGet<MarketCartDto>("/market/cart");

export const getMarketOrders = (params?: {
  role?: "buyer" | "seller";
  status?: string;
  cursor?: string;
}) => {
  const query = new URLSearchParams();
  if (params?.role) query.set("role", params.role);
  if (params?.status) query.set("status", params.status);
  if (params?.cursor) query.set("cursor", params.cursor);
  const encoded = query.toString();
  return marketGet<MarketOrderListResponse>(
    `/market/orders${encoded ? `?${encoded}` : ""}`,
  );
};

export const getMarketOrder = (id: string) =>
  marketGet<MarketOrderDto>(`/market/orders/${encodeURIComponent(id)}`);

export const getMarketChats = () => marketGet<MarketChatsState>("/market/chats");

export const getMarketChat = (id: string) =>
  marketGet<MarketChatState>(`/market/chats/${encodeURIComponent(id)}`);

// ===== Отзывы, подписки, модерация (фаза 3) =====

export const getMarketShopReviews = (slug: string) =>
  marketGet<MarketReviewListResponse>(
    `/market/reviews/shop/${encodeURIComponent(slug)}`,
  );

export const getMarketOrderReview = (orderId: string) =>
  marketGet<MarketReviewDto>(
    `/market/reviews/order/${encodeURIComponent(orderId)}`,
  );

export const getMarketListingComments = (listingId: string) =>
  marketGet<MarketCommentsResponse>(
    `/market/listings/${encodeURIComponent(listingId)}/comments`,
  );

export const getMarketSubscriptions = () =>
  marketGet<MarketSubscriptionDto[]>("/market/subscriptions");

export const getMarketAdminReports = (status?: string) =>
  marketGet<AdminMarketReportListResponse>(
    `/market/admin/reports${status ? `?status=${encodeURIComponent(status)}` : ""}`,
  );
