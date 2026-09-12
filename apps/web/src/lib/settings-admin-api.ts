// Команды настроек платформы из браузера. Чтение — серверное, в lib/api.ts.
import type {
  AdminPlatformSettings,
  AdminUpdatePlatformSettingsRequest,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";

const API_URL = apiBase();

export async function updatePlatformSettings(
  body: AdminUpdatePlatformSettingsRequest,
): Promise<AdminPlatformSettings> {
  const response = await apiFetch(`${API_URL}/admin/settings`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as AdminPlatformSettings;
}
