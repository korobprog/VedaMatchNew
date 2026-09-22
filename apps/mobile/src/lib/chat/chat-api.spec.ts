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

/**
 * Группы и каналы (VED-292): маршруты те же, что у сайта
 * (`apps/web/src/lib/chat-client.ts`). Новых ручек на сервере не заводилось,
 * поэтому контракт закрепляем здесь — опечатка в пути иначе всплывёт только
 * на телефоне.
 */
describe('createChatApi() — группы и каналы', () => {
  it('create шлёт тело запроса как есть на общую ручку бесед', async () => {
    const { client, request } = fakeApi();
    await createChatApi(client).create({ kind: 'group', title: 'Севаки', memberIds: ['u1'] });
    expect(request).toHaveBeenCalledWith('/chat/conversations', {
      method: 'POST',
      body: { kind: 'group', title: 'Севаки', memberIds: ['u1'] },
    });
  });

  it('people и channelCommunities — обычные GET без query', async () => {
    const { client, request } = fakeApi();
    const chat = createChatApi(client);
    await chat.people();
    await chat.channelCommunities();
    expect(request).toHaveBeenNthCalledWith(1, '/chat/people');
    expect(request).toHaveBeenNthCalledWith(2, '/chat/channel-communities');
  });

  it('addMembers складывает id в тело, а не в путь', async () => {
    const { client, request } = fakeApi();
    await createChatApi(client).addMembers('conv-1', ['u1', 'u2']);
    expect(request).toHaveBeenCalledWith('/chat/conversations/conv-1/members', {
      method: 'POST',
      body: { userIds: ['u1', 'u2'] },
    });
  });

  it('removeMember уходит DELETE-ом на участника', async () => {
    const { client, request } = fakeApi();
    await createChatApi(client).removeMember('conv-1', 'u1');
    expect(request).toHaveBeenCalledWith('/chat/conversations/conv-1/members/u1', { method: 'DELETE' });
  });

  it('setMemberRole шлёт роль телом', async () => {
    const { client, request } = fakeApi();
    await createChatApi(client).setMemberRole('conv-1', 'u1', 'admin');
    expect(request).toHaveBeenCalledWith('/chat/conversations/conv-1/members/u1/role', {
      method: 'POST',
      body: { role: 'admin' },
    });
  });

  it('leave бьёт в .../members/me, а не в свой id', async () => {
    const { client, request } = fakeApi();
    await createChatApi(client).leave('conv-1');
    expect(request).toHaveBeenCalledWith('/chat/conversations/conv-1/members/me', { method: 'DELETE' });
  });

  it('removeConversation удаляет саму беседу', async () => {
    const { client, request } = fakeApi();
    await createChatApi(client).removeConversation('conv-1');
    expect(request).toHaveBeenCalledWith('/chat/conversations/conv-1', { method: 'DELETE' });
  });

  it('updateConversation шлёт только переданные поля', async () => {
    const { client, request } = fakeApi();
    await createChatApi(client).updateConversation('conv-1', { title: 'Севаки' });
    expect(request).toHaveBeenCalledWith('/chat/conversations/conv-1', { method: 'POST', body: { title: 'Севаки' } });
  });

  it('id в пути экранируется: чужой слеш не уводит запрос на другую ручку', async () => {
    const { client, request } = fakeApi();
    await createChatApi(client).removeMember('conv/1', 'u 1');
    expect(request).toHaveBeenCalledWith('/chat/conversations/conv%2F1/members/u%201', { method: 'DELETE' });
  });
});
