import type { RegisterNotificationDeviceRequest } from '@vedamatch/shared';
import * as SecureStore from 'expo-secure-store';
import type { ApiClient } from '@/lib/api/client';

/** Последний отправленный на сервер токен: по нему телефон снимается при выходе. */
const TOKEN_KEY = 'vedamatch.push.device-token';

export async function registerDevice(api: ApiClient, device: RegisterNotificationDeviceRequest): Promise<void> {
  await api.request<{ ok: true }>('/notifications/devices', { method: 'POST', body: device });
  await SecureStore.setItemAsync(TOKEN_KEY, device.token);
}

/**
 * Выход из приложения: телефон перестаёт получать пуши этого человека.
 * Ошибку не пробрасывает: выйти нужно даже без сети.
 */
export async function unregisterDevice(api: ApiClient): Promise<void> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  if (!token) return;
  await api
    .request<{ ok: true }>('/notifications/devices', { method: 'DELETE', body: { token } })
    .catch(() => undefined);
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
}
