import { cache } from "react";
import { cookies } from "next/headers";
import type {
  AdminSupportTicketDto,
  AdminSupportTicketListResponse,
  SupportTicketDto,
  SupportTicketListResponse,
  AdminVerificationRequest,
  AdminUserDetail,
  AdminUserListResponse,
  AdminUserReportsResponse,
  AdminAnnouncementDto,
  AdminBillingModeResponse,
  AdminAuditListResponse,
  AdminAuditQuery,
  AdminPortalStats,
  AdminServiceCardDto,
  NotificationBroadcastDto,
  AdminReleaseDto,
  AdminRoadmapItemDto,
  CommunityStats,
  MentorVerificationPublicRequest,
  DevoteeVerificationStatus,
  PricingPlan,
  PublicAnnouncementDto,
  PublicReleaseDto,
  PublicRoadmapItemDto,
  SelfIdentificationState,
  ServiceCard,
  StageHistoryItem,
  UserProfile,
} from "@vedamatch/shared";
import type { Locale } from "@/lib/locale";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/** Server-side запрос к API с пробросом access_token из cookie. null — не авторизован. */
async function apiGet<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

async function apiGetPublic<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  const text = await res.text();
  // Nest/Express отдаёт пустое тело (Content-Length: 0) для контроллеров,
  // вернувших null — например «текущего релиза ещё нет».
  return text ? (JSON.parse(text) as T) : null;
}

/**
 * Профиль текущего пользователя. Обёрнут в React.cache: layout группы (portal)
 * и сама страница запрашивают его в одном рендере — к API уходит один запрос.
 */
export const getProfile = cache(() => apiGet<UserProfile>("/users/me"));
export const getServices = () => apiGet<ServiceCard[]>("/services");
export const getSelfIdentificationState = () =>
  apiGet<SelfIdentificationState>("/self-identification/me");
export const getSelfIdentificationHistory = () =>
  apiGet<StageHistoryItem[]>("/self-identification/history");
export const getAdminVerificationRequests = (status?: DevoteeVerificationStatus) => {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiGet<AdminVerificationRequest[]>(`/admin/verification-requests${query}`);
};
export const getAdminUsers = (query: Record<string, string | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return apiGet<AdminUserListResponse>(`/admin/users${qs ? `?${qs}` : ""}`);
};
/** Каталог сервисов портала. Команды над ним — в lib/catalog-admin-api.ts. */
export const getAdminServices = () =>
  apiGet<AdminServiceCardDto[]>("/admin/catalog/services");
/** Журнал действий администрации. Фильтры приходят из query страницы. */
export const getAdminAudit = (query: AdminAuditQuery) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return apiGet<AdminAuditListResponse>(`/admin/audit${qs ? `?${qs}` : ""}`);
};
/** История рассылок администрации. Команды над ними — в lib/broadcasts-api.ts. */
export const getAdminBroadcasts = () =>
  apiGet<NotificationBroadcastDto[]>("/admin/notifications/broadcasts");
/** Сводка на главной админки; для роли service-admin API отвечает 403. */
export const getAdminPortalStats = () =>
  apiGet<AdminPortalStats>("/admin/stats/portal");
export const getAdminUserReports = (status?: string) => {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiGet<AdminUserReportsResponse>(`/admin/reports${query}`);
};
export const getAdminUser = (id: string) =>
  apiGet<AdminUserDetail>(`/admin/users/${id}`);
export const getMentorVerificationRequest = (token: string) =>
  apiGetPublic<MentorVerificationPublicRequest>(`/mentor-verifications/${token}`);
export const getMySupportTickets = () =>
  apiGet<SupportTicketListResponse>("/support/my/tickets");
export const getMySupportTicket = (id: string) =>
  apiGet<SupportTicketDto>(`/support/my/tickets/${id}`);
export const getSupportTicketByToken = (token: string) =>
  apiGetPublic<SupportTicketDto>(`/support/tickets/track/${token}`);
export const getAdminSupportTickets = (status?: string) => {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiGet<AdminSupportTicketListResponse>(`/admin/support/tickets${query}`);
};
export const getAdminSupportTicket = (id: string) =>
  apiGet<AdminSupportTicketDto>(`/admin/support/tickets/${id}`);
/** Публичный тариф, включает текущий режим биллинга (beta/business). */
export const getBillingPlan = () => apiGetPublic<PricingPlan>("/billing/plan");
export const getCommunityStats = () =>
  apiGetPublic<CommunityStats>("/stats/community");
export const getAdminBillingMode = () =>
  apiGet<AdminBillingModeResponse>("/admin/billing/mode");

// ===== Changelog: версия и новости =====

export const getReleases = (lang: Locale) =>
  apiGetPublic<PublicReleaseDto[]>(`/changelog/releases?lang=${lang}`);
export const getCurrentRelease = (lang: Locale) =>
  apiGetPublic<PublicReleaseDto>(`/changelog/releases/current?lang=${lang}`);
export const getAnnouncements = (lang: Locale) =>
  apiGetPublic<PublicAnnouncementDto[]>(`/changelog/announcements?lang=${lang}`);
export const getRoadmap = (lang: Locale) =>
  apiGetPublic<PublicRoadmapItemDto[]>(`/changelog/roadmap?lang=${lang}`);

export const getAdminReleases = () =>
  apiGet<AdminReleaseDto[]>("/admin/changelog/releases");
export const getAdminAnnouncements = () =>
  apiGet<AdminAnnouncementDto[]>("/admin/changelog/announcements");
export const getAdminRoadmap = () =>
  apiGet<AdminRoadmapItemDto[]>("/admin/changelog/roadmap");
