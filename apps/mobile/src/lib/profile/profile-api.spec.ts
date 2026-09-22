import { ApiError, type ApiClient } from '@/lib/api/client';
import { createProfileApi, describeProfileError } from './profile-api';

/**
 * Клиент профиля: что и каким методом уходит на сервер, и как чужая ошибка
 * превращается в русскую фразу для человека.
 */

function recordingClient() {
  const calls: { path: string; options: unknown }[] = [];
  const api: ApiClient = {
    request: async <T>(path: string, options?: unknown) => {
      calls.push({ path, options: options ?? {} });
      return { id: 'u-1' } as unknown as T;
    },
  };
  return { api, calls };
}

describe('createProfileApi', () => {
  it('профиль читается тем же GET /users/me, что и на сайте', async () => {
    const { api, calls } = recordingClient();
    await createProfileApi(api).me();
    expect(calls[0]).toEqual({ path: '/users/me', options: {} });
  });

  it('правка уходит PATCH /profile с телом', async () => {
    const { api, calls } = recordingClient();
    await createProfileApi(api).update({ name: 'Максим' });
    expect(calls[0]).toEqual({ path: '/profile', options: { method: 'PATCH', body: { name: 'Максим' } } });
  });

  /**
   * `FormData` уходит телом БЕЗ ручного `Content-Type`: границу multipart
   * проставляет сам fetch (`api/client.ts: send()`), и собственный заголовок
   * её ломает. Поэтому в опциях ровно два ключа.
   */
  it('аватар уходит POST /profile/avatar с FormData и без лишних заголовков', async () => {
    const { api, calls } = recordingClient();
    const form = new FormData();
    await createProfileApi(api).uploadAvatar(form);
    expect(calls[0].path).toBe('/profile/avatar');
    expect(calls[0].options).toEqual({ method: 'POST', body: form });
    expect(Object.keys(calls[0].options as object)).not.toContain('headers');
  });

  it('снятие аватара — DELETE того же маршрута', async () => {
    const { api, calls } = recordingClient();
    await createProfileApi(api).deleteAvatar();
    expect(calls[0]).toEqual({ path: '/profile/avatar', options: { method: 'DELETE' } });
  });
});

describe('describeProfileError', () => {
  it('русский отказ сервера показывается как есть', () => {
    expect(describeProfileError(new ApiError(400, 'Имя не может быть пустым', null))).toBe('Имя не может быть пустым');
  });

  it('«нет связи» от клиента (статус 0) — его же текст, а не «сессия закончилась»', () => {
    const message = 'Нет связи с сервером. Проверьте интернет и повторите.';
    expect(describeProfileError(new ApiError(0, message, null))).toBe(message);
  });

  it('401 объясняет, что делать', () => {
    expect(describeProfileError(new ApiError(401, 'Unauthorized', null))).toBe('Сессия закончилась. Войдите снова.');
  });

  it('413 от прокси не оставляет человека без объяснения', () => {
    expect(describeProfileError(new ApiError(413, 'Payload Too Large', null))).toContain('5 МБ');
  });

  it('пятисотка не пересказывается английским текстом сервера', () => {
    expect(describeProfileError(new ApiError(503, 'Service Unavailable', null))).toBe(
      'Сервер временно недоступен. Попробуйте позже.',
    );
  });

  it('400 без сообщения падает на переданную подсказку по месту', () => {
    expect(describeProfileError(new ApiError(400, '', null), 'Не удалось загрузить фотографию.')).toBe(
      'Не удалось загрузить фотографию.',
    );
  });

  it('не-ApiError — это обрыв сети, а не отказ сервера', () => {
    expect(describeProfileError(new TypeError('Network request failed'))).toBe('Нет соединения с сервером.');
  });
});
