import {
  inboxDestination,
  pushDestination,
  resolveNotificationTarget,
  routeOfTarget,
} from './notification-target';

/**
 * Пути взяты из `apps/api/src/modules/notifications/notification-copy.ts` —
 * оттуда, где они на самом деле формулируются, а не придуманы по памяти.
 */
describe('resolveNotificationTarget', () => {
  it('беседа и пуш о звонке ведут в беседу', () => {
    expect(resolveNotificationTarget('/chat/c-1')).toEqual({ kind: 'chat', conversationId: 'c-1' });
    expect(resolveNotificationTarget('/chat/c-1?call=k')).toEqual({
      kind: 'chat',
      conversationId: 'c-1',
    });
    expect(resolveNotificationTarget('/chat/c-1#anchor')).toEqual({
      kind: 'chat',
      conversationId: 'c-1',
    });
  });

  it('служебные разделы чата не принимаются за беседу', () => {
    expect(resolveNotificationTarget('/chat/requests')).toEqual({ kind: 'chat-requests' });
    expect(resolveNotificationTarget('/chat/with/u-1')).toEqual({ kind: 'person', userId: 'u-1' });
    expect(resolveNotificationTarget('/chat/people')).toEqual({ kind: 'inbox' });
    expect(resolveNotificationTarget('/chat/new')).toEqual({ kind: 'inbox' });
  });

  it('бывшие «Контакты» ведут в справочник и к профилю', () => {
    expect(resolveNotificationTarget('/contacts/requests')).toEqual({ kind: 'people' });
    expect(resolveNotificationTarget('/contacts/users/u-7')).toEqual({
      kind: 'person',
      userId: 'u-7',
    });
  });

  it('общины и профили — свои экраны', () => {
    expect(resolveNotificationTarget('/communities/g-1')).toEqual({
      kind: 'community',
      communityId: 'g-1',
    });
    expect(resolveNotificationTarget('/people/u-2')).toEqual({ kind: 'person', userId: 'u-2' });
  });

  it('сама лента — это лента', () => {
    expect(resolveNotificationTarget('/notifications')).toEqual({ kind: 'inbox' });
  });

  it('разделы без своего экрана остаются путём сайта вместе с запросом', () => {
    // Главная регрессия VED-330: раньше каждый из этих путей давал «главную».
    expect(resolveNotificationTarget('/market/orders/o-1')).toEqual({
      kind: 'site',
      path: '/market/orders/o-1',
    });
    expect(resolveNotificationTarget('/notices/n-1')).toEqual({
      kind: 'site',
      path: '/notices/n-1',
    });
    expect(resolveNotificationTarget('/work/spaces/s-1/tasks/T-9')).toEqual({
      kind: 'site',
      path: '/work/spaces/s-1/tasks/T-9',
    });
    expect(resolveNotificationTarget('/updates/news')).toEqual({
      kind: 'site',
      path: '/updates/news',
    });
    expect(resolveNotificationTarget('/support/t-1')).toEqual({
      kind: 'site',
      path: '/support/t-1',
    });
    // `?reel=` нужен форме: без него откроется пустая, а не тот рилс.
    expect(resolveNotificationTarget('/motivation/create?reel=r-1')).toEqual({
      kind: 'site',
      path: '/motivation/create?reel=r-1',
    });
  });

  it('id из пути раскодируется', () => {
    expect(resolveNotificationTarget('/chat/a%20b')).toEqual({ kind: 'chat', conversationId: 'a b' });
  });

  it('битый, чужой и отсутствующий адрес ведут в ленту, а не в беседу', () => {
    expect(resolveNotificationTarget(undefined)).toEqual({ kind: 'inbox' });
    expect(resolveNotificationTarget(null)).toEqual({ kind: 'inbox' });
    expect(resolveNotificationTarget(42)).toEqual({ kind: 'inbox' });
    expect(resolveNotificationTarget('')).toEqual({ kind: 'inbox' });
    expect(resolveNotificationTarget('/chat/')).toEqual({ kind: 'inbox' });
    expect(resolveNotificationTarget('/chat/%E0%A4%A')).toEqual({ kind: 'inbox' });
    // Абсолютный адрес внутрь приложения не пускаем: `//evil.example/chat/x`
    // — это чужой хост, а не путь портала.
    expect(resolveNotificationTarget('https://evil.example/chat/x')).toEqual({ kind: 'inbox' });
  });
});

describe('routeOfTarget', () => {
  it('у каждого раздела, кроме сайта, есть маршрут приложения', () => {
    expect(routeOfTarget({ kind: 'chat', conversationId: 'c-1' })).toEqual({
      kind: 'route',
      pathname: '/chat/[id]',
      params: { id: 'c-1' },
    });
    expect(routeOfTarget({ kind: 'chat-requests' })).toEqual({
      kind: 'route',
      pathname: '/chat/requests',
    });
    expect(routeOfTarget({ kind: 'person', userId: 'u-1' })).toEqual({
      kind: 'route',
      pathname: '/people/[id]',
      params: { id: 'u-1' },
    });
    expect(routeOfTarget({ kind: 'community', communityId: 'g-1' })).toEqual({
      kind: 'route',
      pathname: '/communities/[id]',
      params: { id: 'g-1' },
    });
    expect(routeOfTarget({ kind: 'people' })).toEqual({ kind: 'route', pathname: '/people' });
    expect(routeOfTarget({ kind: 'inbox' })).toEqual({
      kind: 'route',
      pathname: '/notifications',
    });
    expect(routeOfTarget({ kind: 'site', path: '/market' })).toBeNull();
  });
});

describe('pushDestination', () => {
  it('раздел со своим экраном открывается им', () => {
    expect(pushDestination('/chat/c-1')).toEqual({
      kind: 'route',
      pathname: '/chat/[id]',
      params: { id: 'c-1' },
    });
    expect(pushDestination('/chat/requests')).toEqual({
      kind: 'route',
      pathname: '/chat/requests',
    });
  });

  it('раздел без своего экрана ведёт в ленту, а не в браузер', () => {
    // Холодный старт: Custom Tab поверх поднимающегося приложения — верный
    // способ получить молчащее нажатие.
    expect(pushDestination('/market/orders/o-1')).toEqual({
      kind: 'route',
      pathname: '/notifications',
    });
    expect(pushDestination('/notices/n-1')).toEqual({
      kind: 'route',
      pathname: '/notifications',
    });
  });

  it('пуш без адреса ведёт в ленту, а не на список чатов', () => {
    expect(pushDestination(undefined)).toEqual({ kind: 'route', pathname: '/notifications' });
  });

  it('сайт из пуша не открывается никогда', () => {
    for (const url of ['/market', '/notices/n-1', '/updates/news', '/support/t-1', 'мусор']) {
      expect(pushDestination(url).kind).toBe('route');
    }
  });
});

describe('inboxDestination', () => {
  it('раздел со своим экраном открывается им', () => {
    expect(inboxDestination('/chat/c-1')).toEqual({
      kind: 'route',
      pathname: '/chat/[id]',
      params: { id: 'c-1' },
    });
  });

  it('раздел без своего экрана открывает сайт по тому же пути', () => {
    expect(inboxDestination('/market/orders/o-1')).toEqual({
      kind: 'site',
      path: '/market/orders/o-1',
    });
    expect(inboxDestination('/motivation/create?reel=r-1')).toEqual({
      kind: 'site',
      path: '/motivation/create?reel=r-1',
    });
  });

  it('карточка с битым адресом никуда не уводит, кроме самой ленты', () => {
    expect(inboxDestination('мусор')).toEqual({ kind: 'route', pathname: '/notifications' });
  });
});
