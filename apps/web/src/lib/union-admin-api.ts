// Команды админки Union из браузера. Чтение — серверное, в union-api.ts:
// один модуль не может тянуть next/headers и попадать в клиентский компонент.
import type {
  UnionAdminHideProfileRequest,
  UnionAdminProfileDto,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function command(path: string, body?: unknown) {
  const response = await apiFetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as UnionAdminProfileDto;
}

export const hideUnionProfile = (
  userId: string,
  body: UnionAdminHideProfileRequest,
) => command(`/union/admin/profiles/${encodeURIComponent(userId)}/hide`, body);

export const restoreUnionProfile = (userId: string) =>
  command(`/union/admin/profiles/${encodeURIComponent(userId)}/restore`);

export const blockUnionShowcase = (
  userId: string,
  body: UnionAdminHideProfileRequest,
) =>
  command(
    `/union/admin/profiles/${encodeURIComponent(userId)}/showcase/block`,
    body,
  );

export const unblockUnionShowcase = (userId: string) =>
  command(`/union/admin/profiles/${encodeURIComponent(userId)}/showcase/unblock`);
