// Команды админки «Контактов» из браузера. Чтение — серверное, в lib/api.ts.
import type {
  ContactsAdminHideRequest,
  ContactsAdminProfileDto,
  ContactsAdminTagDto,
  CreateContactsTagRequest,
  UpdateContactsTagRequest,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";

const API_URL = apiBase();

async function request<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const response = await apiFetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const createContactsTag = (body: CreateContactsTagRequest) =>
  request<ContactsAdminTagDto>("/chat/people/admin/tags", "POST", body);

export const updateContactsTag = (
  id: string,
  body: UpdateContactsTagRequest,
) =>
  request<ContactsAdminTagDto>(
    `/chat/people/admin/tags/${encodeURIComponent(id)}`,
    "PATCH",
    body,
  );

export const deleteContactsTag = (id: string) =>
  request<void>(`/chat/people/admin/tags/${encodeURIComponent(id)}`, "DELETE");

export const hideContactsProfile = (
  userId: string,
  body: ContactsAdminHideRequest,
) =>
  request<ContactsAdminProfileDto>(
    `/chat/people/admin/profiles/${encodeURIComponent(userId)}/hide`,
    "POST",
    body,
  );

export const restoreContactsProfile = (userId: string) =>
  request<ContactsAdminProfileDto>(
    `/chat/people/admin/profiles/${encodeURIComponent(userId)}/restore`,
    "POST",
  );
