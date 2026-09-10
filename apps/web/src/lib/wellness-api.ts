// API-клиент сервиса «Здоровье». См. docs/service-module-contract.md.
// В коде и маршрутах сервис зовётся `wellness`: имя `health` занято
// техническим liveness-эндпоинтом API.
import type {
  WellnessBasketDto,
  WellnessDietProfileDto,
  WellnessHistoryItem,
  WellnessIngredientDto,
  WellnessProductCard,
  WellnessRecipeDetail,
  WellnessRecipeMatchDto,
  WellnessScanRequest,
  WellnessScanResult,
  WellnessUpdateDietProfileRequest,
  WellnessVerdictResult,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class WellnessApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await apiFetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    // Бэкенд присылает готовый русский текст ошибки — он точнее кода статуса.
    const message = await res
      .json()
      .then((body: { message?: string | string[] }) =>
        Array.isArray(body.message) ? body.message.join(", ") : body.message,
      )
      .catch(() => undefined);
    throw new WellnessApiError(
      message ?? `Запрос не выполнен (${res.status})`,
      res.status,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const getWellnessIngredients = (signal?: AbortSignal) =>
  request<WellnessIngredientDto[]>("/wellness/ingredients", {
    method: "GET",
    signal,
  });

export const getWellnessDiet = (signal?: AbortSignal) =>
  request<WellnessDietProfileDto>("/wellness/diet", { method: "GET", signal });

export const updateWellnessDiet = (body: WellnessUpdateDietProfileRequest) =>
  request<WellnessDietProfileDto>("/wellness/diet", {
    method: "PATCH",
    ...json(body),
  });

/** Скан у полки: по штрихкоду или по снимку состава. */
export const scanWellness = (body: WellnessScanRequest) =>
  request<WellnessScanResult>("/wellness/scan", { method: "POST", ...json(body) });

export const getWellnessProduct = (barcode: string, signal?: AbortSignal) =>
  request<{ product: WellnessProductCard; result: WellnessVerdictResult }>(
    `/wellness/products/by-barcode/${encodeURIComponent(barcode)}`,
    { method: "GET", signal },
  );

export const createWellnessProduct = (body: {
  barcode: string;
  name: string;
  brand?: string;
  ingredientsRaw: string;
}) =>
  request<WellnessProductCard>("/wellness/products", {
    method: "POST",
    ...json(body),
  });

export const reportWellnessProduct = (id: string, comment: string) =>
  request<void>(`/wellness/products/${id}/report`, {
    method: "POST",
    ...json({ comment }),
  });

export const getWellnessHistory = (signal?: AbortSignal) =>
  request<WellnessHistoryItem[]>("/wellness/history", { method: "GET", signal });

export const getWellnessBasket = (signal?: AbortSignal) =>
  request<WellnessBasketDto>("/wellness/basket", { method: "GET", signal });

export const addToWellnessBasket = (productId: string) =>
  request<void>(`/wellness/basket/${productId}`, { method: "POST" });

export const removeFromWellnessBasket = (productId: string) =>
  request<void>(`/wellness/basket/${productId}`, { method: "DELETE" });

/**
 * Снимок состава, когда штрихкод не читается. Картинка уходит одним куском в
 * data-URL: хранить её на портале незачем — нужен только прочитанный текст.
 */
export const recognizeWellnessLabel = (imageDataUrl: string) =>
  request<{ ingredientsRaw: string }>("/wellness/recognize", {
    method: "POST",
    ...json({ imageDataUrl }),
  });

export const getWellnessRecipes = (signal?: AbortSignal) =>
  request<WellnessRecipeDetail[]>("/wellness/recipes", {
    method: "GET",
    signal,
  });

export const getWellnessRecipe = (slug: string, signal?: AbortSignal) =>
  request<WellnessRecipeDetail>(
    `/wellness/recipes/${encodeURIComponent(slug)}`,
    { method: "GET", signal },
  );

/** Что приготовить из набранного. Пустая корзина — пустой список. */
export const getWellnessRecipesForBasket = (signal?: AbortSignal) =>
  request<WellnessRecipeMatchDto[]>("/wellness/recipes/for-basket", {
    method: "GET",
    signal,
  });
