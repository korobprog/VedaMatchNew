import type { ApiClient } from '@/lib/api/client';
import { createStatusApi } from './status-api';

function fakeApi(): { client: ApiClient; request: jest.Mock } {
  const request = jest.fn(async () => ({}));
  return { client: { request } as unknown as ApiClient, request };
}

/**
 * Пути — те же, что у сайта (`chat-statuses.controller.ts`). Опечатка в
 * пути иначе всплыла бы только на телефоне.
 */
describe('createStatusApi (VED-129)', () => {
  it('лента — GET /chat/statuses', async () => {
    const { client, request } = fakeApi();
    await createStatusApi(client).feed();
    expect(request).toHaveBeenCalledWith('/chat/statuses');
  });

  it('кружки — id через запятую одним параметром', async () => {
    const { client, request } = fakeApi();
    await createStatusApi(client).rings(['u1', 'u2']);
    const [path] = request.mock.calls[0] as [string];
    expect(path.startsWith('/chat/statuses/rings?')).toBe(true);
    expect(new URLSearchParams(path.split('?')[1]).get('ids')).toBe('u1,u2');
  });

  it('статусы человека — id экранируется', async () => {
    const { client, request } = fakeApi();
    await createStatusApi(client).ofUser('a/b');
    expect(request).toHaveBeenCalledWith('/chat/statuses/users/a%2Fb');
  });

  it('публикация — POST формы как есть', async () => {
    const { client, request } = fakeApi();
    const form = new FormData();
    await createStatusApi(client).create(form);
    expect(request).toHaveBeenCalledWith('/chat/statuses', { method: 'POST', body: form });
  });

  it('просмотр и удаление', async () => {
    const { client, request } = fakeApi();
    const api = createStatusApi(client);
    await api.view('s1');
    await api.remove('s1');
    expect(request).toHaveBeenNthCalledWith(1, '/chat/statuses/s1/view', { method: 'POST' });
    expect(request).toHaveBeenNthCalledWith(2, '/chat/statuses/s1', { method: 'DELETE' });
  });
});
