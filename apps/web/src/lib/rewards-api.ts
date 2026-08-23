// Клиент сервиса «Баллы и рефералы». См. docs/service-module-contract.md
//
// Серверная половина (для страниц App Router) и браузерная (для форм
// админки) живут в одном файле: `next/headers` подтянут динамическим
// импортом внутрь серверных функций, поэтому клиентские компоненты могут
// импортировать отсюда команды, не ломая сборку.
import type {
  AdminRewardsFraudResponse,
  AdminRewardsLedgerResponse,
  AdminRewardsSettingsDto,
  AdminRewardsSummaryDto,
  AdminUpdateRewardsSettingsRequest,
  RewardsLedgerResponse,
  RewardsMeDto,
  RewardsReferralDto,
} from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";

const SERVER_API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/** null — не авторизован или раздел недоступен. Молча, как в notices-server-api. */
async function rewardsGet<T>(path: string): Promise<T | null> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  const res = await fetch(`${SERVER_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    return null;
  }
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export function getRewardsMe(): Promise<RewardsMeDto | null> {
  return rewardsGet<RewardsMeDto>("/rewards/me");
}

export function getRewardsReferrals(): Promise<RewardsReferralDto[] | null> {
  return rewardsGet<RewardsReferralDto[]>("/rewards/me/referrals");
}

export function getRewardsLedger(
  page = 1,
): Promise<RewardsLedgerResponse | null> {
  return rewardsGet<RewardsLedgerResponse>(`/rewards/me/ledger?page=${page}`);
}

// ===== Админка =====

export function getAdminRewardsSummary(): Promise<AdminRewardsSummaryDto | null> {
  return rewardsGet<AdminRewardsSummaryDto>("/admin/rewards/summary");
}

export function getAdminRewardsLedger(
  page = 1,
): Promise<AdminRewardsLedgerResponse | null> {
  return rewardsGet<AdminRewardsLedgerResponse>(
    `/admin/rewards/ledger?page=${page}`,
  );
}

export function getAdminRewardsFraud(
  page = 1,
): Promise<AdminRewardsFraudResponse | null> {
  return rewardsGet<AdminRewardsFraudResponse>(
    `/admin/rewards/fraud?page=${page}`,
  );
}

export function getAdminRewardsSettings(): Promise<AdminRewardsSettingsDto | null> {
  return rewardsGet<AdminRewardsSettingsDto>("/admin/rewards/settings");
}

/** Команды админки — из браузера, поверх общего http-клиента. */
export async function revokeRewardsEntry(
  entryId: string,
  reason: string,
): Promise<void> {
  const response = await apiFetch(
    `${API_URL}/admin/rewards/ledger/${entryId}/revoke`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    },
  );
  if (!response.ok) throw new Error(await response.text());
}

export async function updateRewardsSettings(
  body: AdminUpdateRewardsSettingsRequest,
): Promise<AdminRewardsSettingsDto> {
  const response = await apiFetch(`${API_URL}/admin/rewards/settings`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as AdminRewardsSettingsDto;
}
