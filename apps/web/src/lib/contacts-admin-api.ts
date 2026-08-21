// Команды админки «Контактов» из браузера. Чтение — серверное, в lib/api.ts.
import type {
  ContactsAdminHideRequest,
  ContactsAdminProfileDto,
  ContactsAdminTagDto,
  CreateContactsTagRequest,
  UpdateContactsTagRequest,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
  request<ContactsAdminTagDto>("/contacts/admin/tags", "POST", body);

export const updateContactsTag = (
  id: string,
  body: UpdateContactsTagRequest,
) =>
  request<ContactsAdminTagDto>(
    `/contacts/admin/tags/${encodeURIComponent(id)}`,
    "PATCH",
    body,
  );

export const deleteContactsTag = (id: string) =>
  request<void>(`/contacts/admin/tags/${encodeURIComponent(id)}`, "DELETE");

export const hideContactsProfile = (
  userId: string,
  body: ContactsAdminHideRequest,
) =>
  request<ContactsAdminProfileDto>(
    `/contacts/admin/profiles/${encodeURIComponent(userId)}/hide`,
    "POST",
    body,
  );

export const restoreContactsProfile = (userId: string) =>
  request<ContactsAdminProfileDto>(
    `/contacts/admin/profiles/${encodeURIComponent(userId)}/restore`,
    "POST",
  );
