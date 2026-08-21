// Команды каталога сервисов из браузера. Чтение — серверное, в lib/api.ts.
import type {
  AdminServiceCardDto,
  CreateAdminServiceRequest,
  UpdateAdminServiceRequest,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function command(
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
): Promise<AdminServiceCardDto> {
  const response = await apiFetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as AdminServiceCardDto;
}

export const updateAdminService = (
  id: string,
  body: UpdateAdminServiceRequest,
) => command(`/admin/catalog/services/${encodeURIComponent(id)}`, "PATCH", body);

export const createAdminService = (body: CreateAdminServiceRequest) =>
  command("/admin/catalog/services", "POST", body);
