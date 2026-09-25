import type { ApiClient, RequestOptions } from '@/lib/api/client';
import { createUnionApi } from './union-api';

function fakeApi() {
  const request = jest.fn(async (_path: string, _options?: RequestOptions) => ({}));
  return { client: { request } as unknown as ApiClient, request };
}

describe('createUnionApi', () => {
  it('выдача несёт фильтры строкой запроса', async () => {
    const { client, request } = fakeApi();
    await createUnionApi(client).recommendations({ intentions: ['family'], page: 2, pageSize: 24 });
    expect(request).toHaveBeenCalledWith('/union/recommendations?intentions=family&page=2&pageSize=24');
  });

  it('решение по анкете — POST /union/swipes телом запроса', async () => {
    const { client, request } = fakeApi();
    await createUnionApi(client).swipe({ toUserId: 'u1', decision: 'superlike' });
    expect(request).toHaveBeenCalledWith('/union/swipes', {
      method: 'POST',
      body: { toUserId: 'u1', decision: 'superlike' },
    });
  });

  it('возврат и новый круг — те же ручки, что у сайта', async () => {
    const { client, request } = fakeApi();
    const union = createUnionApi(client);
    await union.undoLastSwipe();
    await union.newCycle();
    expect(request.mock.calls).toEqual([
      ['/union/swipes/last', { method: 'DELETE' }],
      ['/union/swipes/new-cycle', { method: 'POST' }],
    ]);
  });

  it('ответ на заявку — PATCH с действием в пути', async () => {
    const { client, request } = fakeApi();
    await createUnionApi(client).respond('req/1', 'accept');
    expect(request).toHaveBeenCalledWith('/union/connection-requests/req%2F1/accept', { method: 'PATCH' });
  });

  it('звёздочка — POST ставит, DELETE снимает', async () => {
    const { client, request } = fakeApi();
    const union = createUnionApi(client);
    await union.setFavorite('u1', true);
    await union.setFavorite('u1', false);
    expect(request.mock.calls.map(([, options]) => options?.method)).toEqual(['POST', 'DELETE']);
  });

  it('жалоба уходит с причиной и комментарием', async () => {
    const { client, request } = fakeApi();
    await createUnionApi(client).report('u9', { reason: 'fake_profile', comment: null });
    expect(request).toHaveBeenCalledWith('/union/users/u9/report', {
      method: 'POST',
      body: { reason: 'fake_profile', comment: null },
    });
  });
});
