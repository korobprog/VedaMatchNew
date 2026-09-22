// Клиентский API персональных ключей: выпуск и отзыв делаются из браузера по
// cookie, как и настройки уведомлений, — серверные хелперы lib/api.ts здесь ни
// при чём.
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";

const API_URL = apiBase();

export interface ApiKeyDto {
  id: string;
  name: string;
  /** Хвост ключа: целиком он показывается только в момент выпуска. */
  hint: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  /**
   * Служебный аккаунт, от имени которого ходит ключ. `null` — ключ личный, и
   * всё сделанное им числится за владельцем.
   */
  agent: { id: string; name: string } | null;
}

/** Служебный аккаунт ИИ-агента, на который можно выписать ключ. */
export interface ApiKeyAgentDto {
  id: string;
  name: string;
}

export interface IssuedApiKeyDto {
  id: string;
  name: string;
  /** Единственный раз, когда ключ виден целиком. */
  token: string;
  scopes: string[];
  expiresAt: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    // Текст с сервера важнее кода: там объяснено, чего не хватает — имени,
    // права или свободного места среди десяти ключей.
    const detail = await response
      .json()
      .then((body: { message?: string | string[] }) =>
        Array.isArray(body.message) ? body.message.join("; ") : body.message,
      )
      .catch(() => null);
    throw new Error(detail || `Запрос не прошёл: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const fetchApiKeys = () => request<ApiKeyDto[]>("/auth/api-keys");

/**
 * Служебные аккаунты для формы выпуска. Открыто только администрации, поэтому
 * обычному человеку отвечают отказом — это не поломка, и форма просто не
 * показывает выбор.
 */
export const fetchApiKeyAgents = () =>
  request<ApiKeyAgentDto[]>("/auth/api-keys/agents").catch(
    () => [] as ApiKeyAgentDto[],
  );

export const createApiKey = (body: {
  name: string;
  scopes: string[];
  expiresInDays?: number;
  /** Выпустить ключ от имени ИИ-агента, а не от своего. */
  agentId?: string;
}) =>
  request<IssuedApiKeyDto>("/auth/api-keys", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const revokeApiKey = (id: string) =>
  request<{ ok: true }>(`/auth/api-keys/${id}`, { method: "DELETE" });
