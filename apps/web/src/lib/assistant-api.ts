// Серверный клиент ассистента портала. См. docs/service-module-contract.md
import { cookies } from "next/headers";
import type {
  AssistantAdminUsageDto,
  AssistantSettingsDto,
  AssistantStateDto,
  AssistantThreadDetail,
} from "@vedamatch/shared";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/** Server-side запрос с access_token из cookie. null — не авторизован. */
async function assistantGet<T>(
  path: string,
  options: { emptyOn404?: boolean } = {},
): Promise<T | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) return null;
  if (res.status === 404 && options.emptyOn404) return null;
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export const getAssistantState = () =>
  assistantGet<AssistantStateDto>("/assistant/state");

/** Беседа с историей. null — удалена или чужая: страница откроет новую. */
export const getAssistantThread = (id: string) =>
  assistantGet<AssistantThreadDetail>(
    `/assistant/threads/${encodeURIComponent(id)}`,
    { emptyOn404: true },
  );

export const getAdminAssistantSettings = () =>
  assistantGet<AssistantSettingsDto>("/admin/assistant/settings");

export const getAdminAssistantUsage = (days = 30) =>
  assistantGet<AssistantAdminUsageDto>(`/admin/assistant/usage?days=${days}`);
