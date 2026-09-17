import type { ApiClient } from '@/lib/api/client';

/**
 * Способы входа аккаунта (веха 3, экран «Аккаунт и способы входа»).
 * Привязка Google/Яндекс идёт не через этот клиент, а переходом браузера на
 * `/auth/<provider>?link=1` (см. `account-link.ts`, `buildLinkUrl`) — сервер
 * отвечает редиректом на OAuth-провайдера, а не JSON.
 */

export type AuthProvider = 'google' | 'vk' | 'yandex' | 'email' | 'telegram';

export interface IdentitySummary {
  provider: AuthProvider;
  createdAt: string;
  lastLoginAt: string | null;
  /** Отвязать нельзя, если это последний способ входа аккаунта. */
  canUnlink: boolean;
}

export interface IdentitiesResponse {
  identities: IdentitySummary[];
  /**
   * Почта служебная (`tg-<id>@users.vedamatch.invalid` — Telegram её не
   * сообщает) — экран показывает подсказку привязать Google или Яндекс.
   */
  placeholderEmail: boolean;
}

export function createIdentitiesApi(api: ApiClient) {
  return {
    list: () => api.request<IdentitiesResponse>('/auth/identities'),
    unlink: (provider: AuthProvider) =>
      api.request<{ ok: true }>(`/auth/identities/${provider}`, { method: 'DELETE' }),
    /** Привязка Telegram живой сессией — только внутри мини-приложения. */
    linkTelegram: (initData: string) =>
      api.request<{ ok: true }>('/auth/telegram/link', {
        method: 'POST',
        body: { initData },
      }),
  };
}

export type IdentitiesApi = ReturnType<typeof createIdentitiesApi>;
