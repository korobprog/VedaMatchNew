import { ApiError, type ApiClient, type RequestOptions } from '@/lib/api/client';
import { describeSupportError } from './support-error';
import { createSupportApi } from './support-api';

function fakeApi(handler: (path: string, options?: RequestOptions) => unknown) {
  const calls: { path: string; options?: RequestOptions }[] = [];
  const api: ApiClient = {
    request: async <T,>(path: string, options?: RequestOptions) => {
      calls.push({ path, options });
      const result = handler(path, options);
      if (result instanceof Error) throw result;
      return result as T;
    },
  };
  return { api, calls };
}

const LIST = { items: [{ id: 'abc', number: 7 }], openCount: 1 };

describe('createSupportApi', () => {
  it('ответ уходит в «мои обращения» с id в адресе', async () => {
    const { api, calls } = fakeApi(() => ({}));
    await createSupportApi(api).reply('a/b', 'Спасибо');
    expect(calls[0]).toEqual({ path: '/support/my/tickets/a%2Fb/messages', options: { method: 'POST', body: { body: 'Спасибо' } } });
  });

  it('создание: сначала авторизованный список, потом POST, потом id по номеру', async () => {
    const { api, calls } = fakeApi((path, options) =>
      options?.method === 'POST' ? { number: 7, trackToken: 't', status: 'open', createdAt: '' } : LIST,
    );
    const request = { subject: 'Тема', message: 'Текст', category: 'technical' as const };
    await expect(createSupportApi(api).create(request)).resolves.toEqual({ number: 7, id: 'abc' });
    expect(calls.map((call) => `${call.options?.method ?? 'GET'} ${call.path}`)).toEqual([
      'GET /support/my/tickets',
      'POST /support/tickets',
      'GET /support/my/tickets',
    ]);
    expect(calls[1].options?.body).toBe(request);
  });

  it('401 на проверке сессии не даёт создать обращение гостем', async () => {
    const { api, calls } = fakeApi(() => new ApiError(401, 'Unauthorized', null));
    await expect(createSupportApi(api).create({ subject: 's', message: 'm' })).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
  });

  it('обращение создано, но список не прочитался — номер есть, id нет, без ошибки', async () => {
    let lists = 0;
    const { api } = fakeApi((path, options) => {
      if (options?.method === 'POST') return { number: 9, trackToken: 't', status: 'open', createdAt: '' };
      lists += 1;
      return lists === 1 ? LIST : new TypeError('Network request failed');
    });
    await expect(createSupportApi(api).create({ subject: 's', message: 'm' })).resolves.toEqual({ number: 9, id: null });
  });
});

describe('describeSupportError', () => {
  it('лимит создания объясняет предел и что делать', () => {
    const failure = describeSupportError(new ApiError(429, 'Too Many Requests', null), 'create');
    expect(failure.retryable).toBe(false);
    expect(failure.message).toContain('пять');
  });

  it('лимит ответа — просьба подождать', () => {
    expect(describeSupportError(new ApiError(429, '', null), 'reply').message).toContain('Подождите');
  });

  it('400 — слова сервера как есть', () => {
    expect(describeSupportError(new ApiError(400, 'Заполните тему обращения', null), 'create')).toEqual({
      message: 'Заполните тему обращения',
      retryable: false,
    });
  });

  it('обрыв сети при отправке обещает, что текст сохранён', () => {
    const failure = describeSupportError(new TypeError('Network request failed'), 'create');
    expect(failure).toEqual({ message: expect.stringContaining('текст сохранён'), retryable: true });
  });

  it('обрыв сети при загрузке — про интернет, с повтором', () => {
    expect(describeSupportError(new TypeError('x'), 'load')).toEqual({
      message: 'Нет соединения с сервером. Проверьте интернет.',
      retryable: true,
    });
  });

  it('5xx — повтор имеет смысл, 404 — нет', () => {
    expect(describeSupportError(new ApiError(502, '', null), 'load').retryable).toBe(true);
    expect(describeSupportError(new ApiError(404, '', null), 'load').retryable).toBe(false);
  });
});
