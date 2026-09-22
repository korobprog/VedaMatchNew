import type { ApiClient } from '@/lib/api/client';
import { createInboxApi, inboxPath } from './inbox-api';
import { INBOX_PAGE_SIZE } from './inbox-state';

describe('inboxPath', () => {
  it('размер порции называется всегда', () => {
    // Запрос без параметров сервер считает старым клиентом и отдаёт ленту
    // ЦЕЛИКОМ (`isPaginationRequested` в `apps/api/.../inbox-page.ts`) —
    // две сотни карточек разом вместо двадцати.
    expect(inboxPath()).toBe(`/notifications/inbox?limit=${INBOX_PAGE_SIZE}`);
    expect(inboxPath({})).toContain(`limit=${INBOX_PAGE_SIZE}`);
  });

  it('курсор уходит как есть', () => {
    expect(inboxPath({ cursor: 'dW5yZWFk' })).toBe(
      `/notifications/inbox?limit=${INBOX_PAGE_SIZE}&cursor=dW5yZWFk`,
    );
  });

  it('курсор экранируется: в base64url бывает «-» и «_», но чужого не пропустим', () => {
    expect(inboxPath({ cursor: 'a b&limit=999' })).toContain('cursor=a+b%26limit%3D999');
  });

  it('пустой курсор не отправляется: сервер считает его отсутствующим', () => {
    expect(inboxPath({ cursor: '' })).not.toContain('cursor');
    expect(inboxPath({ cursor: null })).not.toContain('cursor');
  });

  it('свой размер порции уважается', () => {
    expect(inboxPath({ limit: 50 })).toContain('limit=50');
  });
});

describe('createInboxApi', () => {
  function spyClient() {
    const calls: { path: string; options?: unknown }[] = [];
    const api: ApiClient = {
      request: async (path, options) => {
        calls.push({ path, options });
        return null as never;
      },
    };
    return { api, calls };
  }

  it('порция ленты идёт GET-ом по собранному пути', async () => {
    const { api, calls } = spyClient();
    await createInboxApi(api).inbox({ cursor: 'c' });
    expect(calls[0].path).toBe(inboxPath({ cursor: 'c' }));
    expect(calls[0].options).toBeUndefined();
  });

  it('отметка о прочтении: список — это список, пусто — «прочитано всё»', async () => {
    const { api, calls } = spyClient();
    const inbox = createInboxApi(api);
    await inbox.markRead(['n-1']);
    await inbox.markRead();
    expect(calls[0]).toEqual({
      path: '/notifications/inbox/read',
      options: { method: 'POST', body: { ids: ['n-1'] } },
    });
    // Пустое тело, а не `{ ids: [] }`: сервер различает «этих» и «все».
    expect(calls[1].options).toEqual({ method: 'POST', body: {} });
  });

  it('счётчик — отдельная лёгкая ручка', async () => {
    const { api, calls } = spyClient();
    await createInboxApi(api).unreadCount();
    expect(calls[0].path).toBe('/notifications/unread-count');
  });
});
