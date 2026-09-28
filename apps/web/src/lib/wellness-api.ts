// API-клиент сервиса «Здоровье». См. docs/service-module-contract.md.
// В коде и маршрутах сервис зовётся `wellness`: имя `health` занято
// техническим liveness-эндпоинтом API.
import type {
  WellnessArticleDetail,
  WellnessArticleInput,
  WellnessArticleListResponse,
  WellnessBasketDto,
  WellnessDietProfileDto,
  WellnessHistoryItem,
  WellnessIngredientDto,
  WellnessKnowledgeCategoryDto,
  WellnessKnowledgeCategoryInput,
  WellnessKnowledgeCategoryPage,
  WellnessProductCard,
  WellnessRecipeDetail,
  WellnessRecipeMatchDto,
  WellnessScanRequest,
  WellnessScanResult,
  WellnessUpdateDietProfileRequest,
  WellnessVerdictResult,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";

const API_URL = apiBase();

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
  /** Снимок упаковки: по нему автопроверка узнаёт товар (VED-384). */
  labelImageDataUrl?: string;
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

// ===== Знания (VED-229): рубрики и статьи. Правка — админам сервиса =====

export const getWellnessKnowledgeTree = (signal?: AbortSignal) =>
  request<WellnessKnowledgeCategoryDto[]>("/wellness/knowledge/categories", {
    method: "GET",
    signal,
  });

export const getWellnessKnowledgeCategory = (
  slug: string,
  signal?: AbortSignal,
) =>
  request<WellnessKnowledgeCategoryPage>(
    `/wellness/knowledge/categories/${encodeURIComponent(slug)}`,
    { method: "GET", signal },
  );

export const getWellnessKnowledgeArticles = (
  slug: string,
  page: number,
  signal?: AbortSignal,
) =>
  request<WellnessArticleListResponse>(
    `/wellness/knowledge/categories/${encodeURIComponent(slug)}/articles?page=${page}`,
    { method: "GET", signal },
  );

export const getWellnessArticle = (id: string, signal?: AbortSignal) =>
  request<WellnessArticleDetail>(
    `/wellness/knowledge/articles/${encodeURIComponent(id)}`,
    { method: "GET", signal },
  );

export const createWellnessKnowledgeCategory = (
  body: WellnessKnowledgeCategoryInput,
) =>
  request<WellnessKnowledgeCategoryDto>("/wellness/knowledge/categories", {
    method: "POST",
    ...json(body),
  });

export const updateWellnessKnowledgeCategory = (
  id: string,
  body: Partial<WellnessKnowledgeCategoryInput>,
) =>
  request<WellnessKnowledgeCategoryDto>(
    `/wellness/knowledge/categories/${encodeURIComponent(id)}`,
    { method: "PATCH", ...json(body) },
  );

export const deleteWellnessKnowledgeCategory = (id: string) =>
  request<void>(`/wellness/knowledge/categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

export const createWellnessArticle = (body: WellnessArticleInput) =>
  request<WellnessArticleDetail>("/wellness/knowledge/articles", {
    method: "POST",
    ...json(body),
  });

export const updateWellnessArticle = (
  id: string,
  body: Partial<WellnessArticleInput>,
) =>
  request<WellnessArticleDetail>(
    `/wellness/knowledge/articles/${encodeURIComponent(id)}`,
    { method: "PATCH", ...json(body) },
  );

export const deleteWellnessArticle = (id: string) =>
  request<void>(`/wellness/knowledge/articles/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

export const uploadWellnessArticleCover = (id: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  // Content-Type не задаём: браузер сам поставит boundary для multipart.
  return request<WellnessArticleDetail>(
    `/wellness/knowledge/articles/${encodeURIComponent(id)}/cover`,
    { method: "POST", body: form },
  );
};

export const deleteWellnessArticleCover = (id: string) =>
  request<WellnessArticleDetail>(
    `/wellness/knowledge/articles/${encodeURIComponent(id)}/cover`,
    { method: "DELETE" },
  );
