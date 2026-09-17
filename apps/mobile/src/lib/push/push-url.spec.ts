import { pushTarget, pushUrlOf, rnfbMessageUrlOf } from './push-url';

describe('pushTarget', () => {
  it('беседа и звонок ведут в беседу', () => {
    expect(pushTarget('/chat/c-1')).toEqual({ kind: 'chat', conversationId: 'c-1' });
    expect(pushTarget('/chat/c-1?call=k')).toEqual({ kind: 'chat', conversationId: 'c-1' });
  });

  it('служебные разделы и чужие сервисы ведут на главную', () => {
    expect(pushTarget('/chat/requests')).toEqual({ kind: 'home' });
    expect(pushTarget('/chat/with/u-1')).toEqual({ kind: 'home' });
    expect(pushTarget('/notifications')).toEqual({ kind: 'home' });
    expect(pushTarget('/market/chats/m-1')).toEqual({ kind: 'home' });
    expect(pushTarget(undefined)).toEqual({ kind: 'home' });
  });
});

describe('pushUrlOf', () => {
  it('берёт ссылку из данных уведомления', () => {
    expect(pushUrlOf({ request: { content: { data: { url: '/chat/a' } } } })).toBe('/chat/a');
  });

  it('при закрытом приложении берёт её из сообщения FCM', () => {
    expect(
      pushUrlOf({
        request: { content: { data: {} }, trigger: { remoteMessage: { data: { url: '/chat/b' } } } },
      }),
    ).toBe('/chat/b');
  });

  it('без ссылки даёт null', () => {
    expect(pushUrlOf({ request: { content: {} } })).toBeNull();
  });
});

describe('rnfbMessageUrlOf', () => {
  it('берёт ссылку из data сырого FCM-сообщения', () => {
    expect(rnfbMessageUrlOf({ data: { url: '/chat/c-1' } })).toBe('/chat/c-1');
  });

  it('без data, без url или без сообщения вовсе — null, не падает', () => {
    expect(rnfbMessageUrlOf({ data: {} })).toBeNull();
    expect(rnfbMessageUrlOf({})).toBeNull();
    expect(rnfbMessageUrlOf(null)).toBeNull();
    expect(rnfbMessageUrlOf(undefined)).toBeNull();
  });

  it('url не строка — null', () => {
    expect(rnfbMessageUrlOf({ data: { url: { nested: true } } })).toBeNull();
  });
});
