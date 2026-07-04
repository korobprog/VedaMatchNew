import { cookies } from "next/headers";
import type {
  AdminVerificationRequest,
  MentorVerificationPublicRequest,
  DevoteeVerificationStatus,
  SelfIdentificationState,
  ServiceCard,
  StageHistoryItem,
  UserProfile,
} from "@vedamatch/shared";

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
  return (await res.json()) as T;
}

export const getProfile = () => apiGet<UserProfile>("/users/me");
export const getServices = () => apiGet<ServiceCard[]>("/services");
export const getSelfIdentificationState = () =>
  apiGet<SelfIdentificationState>("/self-identification/me");
export const getSelfIdentificationHistory = () =>
  apiGet<StageHistoryItem[]>("/self-identification/history");
export const getAdminVerificationRequests = (status?: DevoteeVerificationStatus) => {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiGet<AdminVerificationRequest[]>(`/admin/verification-requests${query}`);
};
export const getMentorVerificationRequest = (token: string) =>
  apiGetPublic<MentorVerificationPublicRequest>(`/mentor-verifications/${token}`);
