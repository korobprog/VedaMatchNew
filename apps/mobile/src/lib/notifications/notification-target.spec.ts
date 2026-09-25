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
    // Гостевая ссылка на обращение — не обращение аккаунта, её держит сайт.
    expect(resolveNotificationTarget('/support/track/tok')).toEqual({
      kind: 'site',
      path: '/support/track/tok',
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

  it('ответ поддержки открывает само обращение, без id — список обращений (VED-336)', () => {
    expect(resolveNotificationTarget('/support/t-1')).toEqual({ kind: 'support', ticketId: 't-1' });
    expect(pushDestination('/support/t-1')).toEqual({
      kind: 'route',
      pathname: '/support/[id]',
      params: { id: 't-1' },
    });
    expect(pushDestination('/support')).toEqual({ kind: 'route', pathname: '/support' });
    expect(inboxDestination('/support/t-1?x=1').kind).toBe('route');
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

describe('«Здоровье»: решение по присланной карточке (VED-384)', () => {
  it('принятая карточка открывает нативный ответ по штрихкоду', () => {
    expect(resolveNotificationTarget('/wellness/products/3017620422003')).toEqual({
      kind: 'wellness-product',
      barcode: '3017620422003',
    });
    expect(
      routeOfTarget({ kind: 'wellness-product', barcode: '3017620422003' }),
    ).toEqual({
      kind: 'route',
      pathname: '/wellness/result/[barcode]',
      params: { barcode: '3017620422003' },
    });
  });

  it('на проверке или отклонена — история проверок', () => {
    expect(resolveNotificationTarget('/wellness/history')).toEqual({
      kind: 'wellness-history',
    });
    expect(routeOfTarget({ kind: 'wellness-history' })).toEqual({
      kind: 'route',
      pathname: '/wellness/history',
    });
  });

  it('не штрихкод в пути — не экран ответа, а сайт', () => {
    expect(resolveNotificationTarget('/wellness/products/abc')).toEqual({
      kind: 'site',
      path: '/wellness/products/abc',
    });
    expect(resolveNotificationTarget('/wellness/recipes')).toEqual({
      kind: 'site',
      path: '/wellness/recipes',
    });
  });
});

describe('новая версия приложения: пуш «Доступна новая версия»', () => {
  it('путь /app — раздел обновления, а не лента и не браузер', () => {
    expect(resolveNotificationTarget('/app')).toEqual({ kind: 'app-update' });
    expect(resolveNotificationTarget('/app/')).toEqual({ kind: 'app-update' });
    expect(resolveNotificationTarget('/app?from=push')).toEqual({ kind: 'app-update' });
  });

  it('нажатие открывает вкладку «Сервисы» с проверкой обновления', () => {
    expect(pushDestination('/app')).toEqual({ kind: 'route', pathname: '/services' });
  });

  it('из ленты — туда же: страница загрузки на сайте телефону с приложением не нужна', () => {
    expect(inboxDestination('/app')).toEqual({ kind: 'route', pathname: '/services' });
  });

  it('глубже /app — это не пуш об обновлении, а обычный путь сайта', () => {
    expect(resolveNotificationTarget('/app/privacy')).toEqual({
      kind: 'site',
      path: '/app/privacy',
    });
  });
});

describe('Знакомства: пуш «Новая заявка» и ссылки на анкеты', () => {
  it('«Новая заявка» (`/union/connections`) открывает связи в приложении', () => {
    expect(resolveNotificationTarget('/union/connections')).toEqual({ kind: 'union', section: 'connections' });
    expect(pushDestination('/union/connections')).toEqual({ kind: 'route', pathname: '/union/connections' });
    expect(inboxDestination('/union/connections')).toEqual({ kind: 'route', pathname: '/union/connections' });
  });

  it('лайки и анкета человека — свои экраны', () => {
    expect(pushDestination('/union/likes')).toEqual({ kind: 'route', pathname: '/union/likes' });
    expect(pushDestination('/union/users/u%201')).toEqual({
      kind: 'route',
      pathname: '/union/users/[id]',
      params: { id: 'u 1' },
    });
  });

  it('остальные разделы Знакомств — вход в раздел, он сам решит, куда вести', () => {
    expect(pushDestination('/union')).toEqual({ kind: 'route', pathname: '/union' });
    expect(pushDestination('/union/profile')).toEqual({ kind: 'route', pathname: '/union' });
    expect(pushDestination('/union/users/')).toEqual({ kind: 'route', pathname: '/union' });
  });

  it('старые ссылки на чаты Знакомств и админка остаются сайтом — там редиректы', () => {
    expect(resolveNotificationTarget('/union/chats/r-1')).toEqual({ kind: 'site', path: '/union/chats/r-1' });
    expect(resolveNotificationTarget('/union/admin/profiles/u-1')).toEqual({
      kind: 'site',
      path: '/union/admin/profiles/u-1',
    });
  });
});
