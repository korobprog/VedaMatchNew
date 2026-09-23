import { ApiError, type ApiClient, type RequestOptions } from '@/lib/api/client';
import { SearchCancelled, createSearchApi } from './search-api';
import { openSearchTarget } from './open-search-target';

function fakeApi(handler: (path: string) => unknown) {
  const calls: { path: string; options?: RequestOptions }[] = [];
  const api: ApiClient = {
    request: async <T,>(path: string, options?: RequestOptions) => {
      calls.push({ path, options });
      const result = handler(path);
      if (result instanceof Error) throw result;
      return result as T;
    },
  };
  return { api, calls };
}

describe('createSearchApi', () => {
  it('спрашивает четыре существующие ручки с одной отменой', async () => {
    const { api, calls } = fakeApi(() => ({}));
    const controller = new AbortController();
    const outcomes = await createSearchApi(api).search('кришна дас', controller.signal);
    expect(calls.map((c) => c.path).sort()).toEqual([
      '/assistant/search?q=%D0%BA%D1%80%D0%B8%D1%88%D0%BD%D0%B0%20%D0%B4%D0%B0%D1%81',
      '/chat/people/search?q=%D0%BA%D1%80%D0%B8%D1%88%D0%BD%D0%B0%20%D0%B4%D0%B0%D1%81&pageSize=5',
      '/chat/search?q=%D0%BA%D1%80%D0%B8%D1%88%D0%BD%D0%B0%20%D0%B4%D0%B0%D1%81',
      '/communities?q=%D0%BA%D1%80%D0%B8%D1%88%D0%BD%D0%B0%20%D0%B4%D0%B0%D1%81&pageSize=5',
    ]);
    for (const call of calls) expect(call.options?.signal).toBe(controller.signal);
    expect(Object.values(outcomes).every((o) => o.status === 'ok')).toBe(true);
  });

  it('двухбуквенный запрос переписку не трогает', async () => {
    const { api, calls } = fakeApi(() => ({}));
    const outcomes = await createSearchApi(api).search('ом', new AbortController().signal);
    expect(calls.some((c) => c.path.startsWith('/chat/search'))).toBe(false);
    expect(outcomes.chats).toEqual({ status: 'skipped' });
  });

  it('упавший источник — «failed» на своём месте, остальные целы', async () => {
    const { api } = fakeApi((path) => (path.startsWith('/communities') ? new ApiError(500, 'x', null) : {}));
    const outcomes = await createSearchApi(api).search('ятра', new AbortController().signal);
    expect(outcomes.communities).toEqual({ status: 'failed' });
    expect(outcomes.people.status).toBe('ok');
  });

  it('отменённый поиск не возвращает ничего — бросает', async () => {
    const controller = new AbortController();
    const { api } = fakeApi(() => {
      controller.abort();
      return new Error('Aborted');
    });
    await expect(createSearchApi(api).search('ятра', controller.signal)).rejects.toBeInstanceOf(SearchCancelled);
  });
});

describe('openSearchTarget', () => {
  const opener = { openBrowser: jest.fn(async () => undefined), openLink: jest.fn(async () => undefined) };

  beforeEach(() => jest.clearAllMocks());

  it('свой экран — переходом, браузер не трогает', async () => {
    const push = jest.fn();
    const result = await openSearchTarget(
      { kind: 'route', pathname: '/people/[id]', params: { id: 'u1' } },
      { push, opener, webOrigin: 'https://vedamatch.ru' },
    );
    expect(push).toHaveBeenCalledWith({ pathname: '/people/[id]', params: { id: 'u1' } });
    expect(opener.openBrowser).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('сайт — адресом портала этой сборки', async () => {
    const result = await openSearchTarget(
      { kind: 'site', path: '/market/listing/2' },
      { push: jest.fn(), opener, webOrigin: 'https://vedamatch.com/' },
    );
    expect(opener.openBrowser).toHaveBeenCalledWith('https://vedamatch.com/market/listing/2');
    expect(result).toEqual({ kind: 'opened', via: 'browser' });
  });

  it('браузера нет — честный текст с адресом', async () => {
    const broken = { openBrowser: jest.fn(async () => Promise.reject(new Error('no'))), openLink: jest.fn(async () => Promise.reject(new Error('no'))) };
    const result = await openSearchTarget(
      { kind: 'site', path: '/notices/1' },
      { push: jest.fn(), opener: broken, webOrigin: 'https://vedamatch.ru' },
    );
    expect(result).toEqual({ kind: 'failed', message: 'Не удалось открыть браузер. Откройте vedamatch.ru/notices/1 вручную.' });
  });
});
