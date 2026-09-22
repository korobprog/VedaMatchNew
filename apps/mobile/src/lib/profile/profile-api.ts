import type { ProfileUpdateRequest, UserProfile } from '@vedamatch/shared';
import { ApiError, type ApiClient } from '@/lib/api/client';

/**
 * Маршруты портального профиля — ровно те же, которыми пользуется сайт
 * (`apps/web/src/components/profile-editor.tsx`): `GET /users/me`,
 * `PATCH /profile`, `POST|DELETE /profile/avatar`. Нового серверного кода
 * под приложение не потребовалось: `ProfileController` уже принимает
 * multipart-поле `file`, а `AuthGuard` — заголовок `Authorization: Bearer`
 * наравне с cookie сайта.
 *
 * Все три изменяющих вызова возвращают профиль целиком — экран берёт
 * состояние из ответа, а не досочиняет его из того, что отправлял.
 */
export function createProfileApi(api: ApiClient) {
  return {
    me: () => api.request<UserProfile>('/users/me'),
    update: (body: ProfileUpdateRequest) =>
      api.request<UserProfile>('/profile', { method: 'PATCH', body }),
    /** `form` уже содержит часть `file`, собранную `buildUploadFormPart`. */
    uploadAvatar: (form: FormData) =>
      api.request<UserProfile>('/profile/avatar', { method: 'POST', body: form }),
    deleteAvatar: () => api.request<UserProfile>('/profile/avatar', { method: 'DELETE' }),
  };
}

export type ProfileApi = ReturnType<typeof createProfileApi>;

/**
 * Текст ошибки по-русски — тот же приём, что у `identities-error.ts`.
 * 400 от `PATCH /profile` и `POST /profile/avatar` сервер уже пишет
 * по-русски и по делу («Имя не может быть пустым», «Разрешены только jpg,
 * jpeg, png и webp», «S3-хранилище не настроено»), поэтому его сообщение
 * показывается как есть: пересказывать своими словами значит завести второй
 * текст на то же правило и разойтись с ним при следующей правке сервера.
 */
export function describeProfileError(error: unknown, fallback = 'Не удалось сохранить профиль.'): string {
  if (error instanceof ApiError) {
    // ApiError со статусом 0 — «нет связи», её ставит сам клиент, когда
    // обновление токена не прошло по сети; текст там уже человеческий.
    if (error.status === 0) return error.message;
    if (error.status === 401) return 'Сессия закончилась. Войдите снова.';
    if (error.status === 413) return 'Фото слишком большое — до 5 МБ.';
    if (error.status >= 500) return 'Сервер временно недоступен. Попробуйте позже.';
    return error.message || fallback;
  }
  return 'Нет соединения с сервером.';
}
