// Серверный клиент замеров. Отдельный файл от telemetry-api.ts: `next/headers`
// нельзя тянуть в модуль, который импортируют клиентские компоненты.
import { cookies } from "next/headers";
import type { InstallEnvironmentSummary } from "@vedamatch/shared";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/** null — не авторизован или не администратор. */
export async function getInstallEnvironmentSummary(): Promise<InstallEnvironmentSummary | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  const res = await fetch(`${API_URL}/telemetry/install-environment`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok)
    throw new Error(`API /telemetry/install-environment failed: ${res.status}`);
  return (await res.json()) as InstallEnvironmentSummary;
}
