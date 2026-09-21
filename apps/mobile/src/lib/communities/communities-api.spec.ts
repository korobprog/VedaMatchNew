import type { ApiClient } from '@/lib/api/client';
import { createCommunitiesApi } from './communities-api';

function fakeApi(): { client: ApiClient; request: jest.Mock } {
  const request = jest.fn(async () => ({}));
  return { client: { request } as unknown as ApiClient, request };
}

describe('createCommunitiesApi().create', () => {
  it('заводит общину POST-ом на портальную ручку /communities', async () => {
    const { client, request } = fakeApi();
    await createCommunitiesApi(client).create({ kind: 'yatra', name: 'Минская ятра' });
    expect(request).toHaveBeenCalledWith('/communities', {
      method: 'POST',
      body: { kind: 'yatra', name: 'Минская ятра' },
    });
  });
});

describe('createCommunitiesApi().geoSearch', () => {
  it('экранирует запрос: пробелы и кириллица не ломают путь', async () => {
    const { client, request } = fakeApi();
    await createCommunitiesApi(client).geoSearch('Нижний Новгород');
    const [path] = request.mock.calls[0] as [string];
    expect(path.startsWith('/geo/search?q=')).toBe(true);
    expect(path).not.toContain(' ');
    expect(decodeURIComponent(path.split('q=')[1])).toBe('Нижний Новгород');
  });

  it('передаёт signal, чтобы устаревшая подсказка отменялась', async () => {
    const { client, request } = fakeApi();
    const controller = new AbortController();
    await createCommunitiesApi(client).geoSearch('Минск', controller.signal);
    expect(request.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });
});

describe('createCommunitiesApi().mine', () => {
  it('остаётся прежним GET без параметров', async () => {
    const { client, request } = fakeApi();
    await createCommunitiesApi(client).mine();
    expect(request).toHaveBeenCalledWith('/communities/me');
  });
});
