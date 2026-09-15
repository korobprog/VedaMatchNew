import type { ApiClient } from '@/lib/api/client';
import { createChatApi } from './chat-api';

function fakeApi(): { client: ApiClient; request: jest.Mock } {
  const request = jest.fn(async () => ({}));
  return { client: { request } as unknown as ApiClient, request };
}

/**
 * `discover` — единственный эндпоинт каталога, и без `communityId` он отдаёт
 * вообще все публичные беседы портала (риск, отмеченный в `spec.md`,
 * VED-170: «Риски и открытые вопросы»). Экран `communities/[id]` обязан
 * передавать его всегда — здесь закреплён сам контракт построения запроса,
 * раунд оценки 006, дефект 8.
 */
describe('createChatApi().discover', () => {
  it('передаёт communityId в query, когда он задан', async () => {
    const { client, request } = fakeApi();
    await createChatApi(client).discover({ communityId: 'c1' });
    expect(request).toHaveBeenCalledWith('/chat/discover?communityId=c1');
  });

  it('без параметров запрашивает общий каталог без query-строки', async () => {
    const { client, request } = fakeApi();
    await createChatApi(client).discover();
    expect(request).toHaveBeenCalledWith('/chat/discover');
  });

  it('передаёт и communityId, и q одновременно', async () => {
    const { client, request } = fakeApi();
    await createChatApi(client).discover({ communityId: 'c1', q: 'киртан' });
    const [path] = request.mock.calls[0] as [string];
    const query = new URLSearchParams(path.split('?')[1]);
    expect(query.get('communityId')).toBe('c1');
    expect(query.get('q')).toBe('киртан');
  });
});

describe('createChatApi().subscribe', () => {
  it('уходит POST-ом на .../subscribe с нужным id', async () => {
    const { client, request } = fakeApi();
    await createChatApi(client).subscribe('conv-1');
    expect(request).toHaveBeenCalledWith('/chat/conversations/conv-1/subscribe', { method: 'POST' });
  });
});
