// Админский клиент сервиса «Здоровье». Отдельный файл от пользовательского:
// у него другие маршруты и другие права, и мешать их в одном месте значит
// однажды дёрнуть админский эндпоинт из пользовательского экрана.
import type {
  WellnessIngredientClass,
  WellnessIngredientDto,
  WellnessIngredientSeverity,
  WellnessProductStatus,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface AdminWellnessProduct {
  id: string;
  barcode: string;
  name: string;
  brand: string | null;
  ingredientsRaw: string;
  imageUrl: string | null;
  labelImageUrl: string | null;
  source: string;
  status: WellnessProductStatus;
  createdAt: string;
  addedBy: { id: string; name: string } | null;
  ingredients: {
    matchedText: string;
    severity: WellnessIngredientSeverity;
    ingredient: { key: string; nameRu: string; class: WellnessIngredientClass };
  }[];
}

export interface AdminWellnessRecipe {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  source: string | null;
  status: WellnessProductStatus;
  ingredients: { nameRu: string; amountRu: string | null }[];
}

export interface AdminWellnessReport {
  id: string;
  comment: string;
  createdAt: string;
  author: { id: string; name: string } | null;
  product: { id: string; name: string; barcode: string };
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await apiFetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    const message = await res
      .json()
      .then((body: { message?: string | string[] }) =>
        Array.isArray(body.message) ? body.message.join(", ") : body.message,
      )
      .catch(() => undefined);
    throw new Error(message ?? `Запрос не выполнен (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const getAdminWellnessProducts = (
  status: WellnessProductStatus,
  signal?: AbortSignal,
) =>
  request<AdminWellnessProduct[]>(`/wellness/admin/products?status=${status}`, {
    method: "GET",
    signal,
  });

export const approveWellnessProduct = (id: string) =>
  request<{ id: string }>(`/wellness/admin/products/${id}/approve`, {
    method: "POST",
  });

export const rejectWellnessProduct = (id: string, reason: string) =>
  request<{ id: string }>(`/wellness/admin/products/${id}/reject`, {
    method: "POST",
    ...json({ reason }),
  });

export const getAdminWellnessReports = (signal?: AbortSignal) =>
  request<AdminWellnessReport[]>("/wellness/admin/reports", {
    method: "GET",
    signal,
  });

export const decideWellnessReport = (id: string, accepted: boolean) =>
  request<{ id: string }>(
    `/wellness/admin/reports/${id}/${accepted ? "accept" : "reject"}`,
    { method: "POST" },
  );

export const getAdminWellnessIngredients = (signal?: AbortSignal) =>
  request<WellnessIngredientDto[]>("/wellness/admin/ingredients", {
    method: "GET",
    signal,
  });

export const saveWellnessIngredient = (body: {
  id?: string;
  key: string;
  nameRu: string;
  nameEn?: string;
  aliases: string[];
  class: WellnessIngredientClass;
  severity: WellnessIngredientSeverity;
  eNumber?: string;
  noteRu?: string;
}) =>
  request<WellnessIngredientDto>("/wellness/admin/ingredients", {
    method: "POST",
    ...json(body),
  });

export const deleteWellnessIngredient = (id: string) =>
  request<void>(`/wellness/admin/ingredients/${id}`, { method: "DELETE" });

export const getAdminWellnessRecipes = (signal?: AbortSignal) =>
  request<AdminWellnessRecipe[]>("/wellness/admin/recipes", {
    method: "GET",
    signal,
  });

export const setWellnessRecipeStatus = (
  id: string,
  status: WellnessProductStatus,
) =>
  request<{ id: string; status: string }>(
    `/wellness/admin/recipes/${id}/status`,
    { method: "POST", ...json({ status }) },
  );

export const deleteWellnessRecipe = (id: string) =>
  request<void>(`/wellness/admin/recipes/${id}`, { method: "DELETE" });
