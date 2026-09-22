import { pushTarget, pushUrlOf, rnfbMessageUrlOf } from './push-url';

/**
 * Разбор пути целиком живёт в `lib/notifications/notification-target.ts` и
 * проверен там: таблица одна на пуш и на ленту уведомлений. Здесь — что
 * `pushTarget` действительно её зовёт, и главное — что раздел вне беседы
 * больше не приземляется на список чатов.
 *
 * Прежний тест закреплял ровно обратное: `{ kind: 'home' }` на всё, кроме
 * беседы. Это и был баг VED-330 — пуш про Рынок, объявление или «Работу»
 * молча открывал чаты, и человек не узнавал, что произошло.
 */
describe('pushTarget', () => {
  it('беседа и звонок ведут в беседу', () => {
    expect(pushTarget('/chat/c-1')).toEqual({ kind: 'chat', conversationId: 'c-1' });
    expect(pushTarget('/chat/c-1?call=k')).toEqual({ kind: 'chat', conversationId: 'c-1' });
  });

  it('служебные разделы чата различаются, а не сваливаются в одну кучу', () => {
    expect(pushTarget('/chat/requests')).toEqual({ kind: 'chat-requests' });
    expect(pushTarget('/chat/with/u-1')).toEqual({ kind: 'person', userId: 'u-1' });
  });

  it('чужие сервисы больше не ведут на список чатов', () => {
    expect(pushTarget('/market/chats/m-1')).toEqual({ kind: 'site', path: '/market/chats/m-1' });
    expect(pushTarget('/notifications')).toEqual({ kind: 'inbox' });
    expect(pushTarget(undefined)).toEqual({ kind: 'inbox' });
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
