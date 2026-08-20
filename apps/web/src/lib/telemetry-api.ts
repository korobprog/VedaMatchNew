// Клиентский API замеров: окружение установки известно только браузеру,
// поэтому запрос идёт отсюда, а не через серверные хелперы lib/api.ts.
import type {
  InstallEnvironmentReport,
  InstallEnvironmentSummary,
} from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";

/**
 * Замер — не функциональность, а наблюдение: неудача не должна ни падать
 * наружу, ни попадать в консоль пользователя. Гость получит 401 и это
 * нормально — сводка считается по авторизованным.
 */
export async function reportInstallEnvironment(
  report: InstallEnvironmentReport,
): Promise<void> {
  try {
    await apiFetch(`${API_URL}/telemetry/install-environment`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });
  } catch {
    // Замер не состоялся — портал от этого не меняется.
  }
}

export async function fetchInstallEnvironmentSummary(): Promise<InstallEnvironmentSummary> {
  const response = await apiFetch(`${API_URL}/telemetry/install-environment`, {
    credentials: "include",
  });
  if (!response.ok)
    throw new Error(`telemetry summary failed: ${response.status}`);
  return (await response.json()) as InstallEnvironmentSummary;
}
