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

  it('анкета сохраняется PUT-ом, статус и место — в портальный профиль', async () => {
    const { client, request } = fakeApi();
    const union = createUnionApi(client);
    await union.updateProfile({ heightCm: 170, intentions: [{ type: 'family', weight: 100 }] });
    await union.saveStatusLine(null);
    await union.saveHomeLocation({ city: 'Казань', country: 'Россия', lat: 1, lon: 2 });
    expect(request.mock.calls).toEqual([
      ['/union/profile', { method: 'PUT', body: { heightCm: 170, intentions: [{ type: 'family', weight: 100 }] } }],
      ['/profile', { method: 'PATCH', body: { statusLine: null } }],
      ['/profile', { method: 'PATCH', body: { homeLocation: { city: 'Казань', country: 'Россия', lat: 1, lon: 2 } } }],
    ]);
  });

  it('подсказки городов — с отбором по стране', async () => {
    const { client, request } = fakeApi();
    await createUnionApi(client).searchCities(' Нижний ', 'Россия');
    expect(request.mock.calls[0][0]).toBe(
      `/geo/search?q=${encodeURIComponent('Нижний')}&country=${encodeURIComponent('Россия')}`,
    );
  });

  it('фото уходят полем files байтовыми частями, порядок — списком id', async () => {
    const { client, request } = fakeApi();
    const buildPart = jest.fn(async (source: { name: string; type: string }) => ({
      name: source.name,
      type: source.type,
      bytes: async () => new Uint8Array([1]),
    }));
    const appended: [string, unknown][] = [];
    const realFormData = global.FormData;
    global.FormData = class {
      append(name: string, value: unknown) {
        appended.push([name, value]);
      }
    } as unknown as typeof FormData;
    try {
      const union = createUnionApi(client, buildPart);
      await union.uploadPhotos([{ uri: 'file:///a.jpg', name: 'photo-1.jpg', type: 'image/jpeg' }]);
      await union.reorderPhotos(['b', 'a']);
    } finally {
      global.FormData = realFormData;
    }
    expect(appended.map(([name]) => name)).toEqual(['files']);
    expect(request.mock.calls[0][0]).toBe('/profile/photos');
    expect(request.mock.calls[1]).toEqual(['/profile/photos/order', { method: 'PUT', body: { photoIds: ['b', 'a'] } }]);
  });

  it('скрытые: вернуть из архива и снять блокировку — DELETE', async () => {
    const { client, request } = fakeApi();
    const union = createUnionApi(client);
    await union.unarchive('u1');
    await union.unblock('u2');
    expect(request.mock.calls).toEqual([
      ['/union/archive/u1', { method: 'DELETE' }],
      ['/union/users/u2/block', { method: 'DELETE' }],
    ]);
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
