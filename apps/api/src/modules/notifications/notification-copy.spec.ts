import { buildNotification, toExcerpt } from './notification-copy';

describe('buildNotification', () => {
  it('показывает имя отправителя и начало сообщения', () => {
    expect(
      buildNotification({
        name: 'union.chat.message-sent',
        recipientId: 'u1',
        senderName: 'Вринда',
        body: 'Харе Кришна, как ваша садхана?',
        requestId: 'r1',
      }),
    ).toEqual({
      title: 'Вринда',
      body: 'Харе Кришна, как ваша садхана?',
      url: '/union/chats/r1',
      tag: 'chat:r1',
      category: 'chat',
    });
  });

  it('ведёт автора в студию, где с кадром можно работать', () => {
    // `/m/<slug>` сделана для внешних ссылок и незалогиненных: посмотреть
    // можно, сделать нельзя. Автор приходит по уведомлению доводить рилс.
    expect(
      buildNotification({
        name: 'motivation.reel.published',
        recipientId: 'u1',
        reelId: 'reel-1',
        slug: 'reel-abc',
      }),
    ).toMatchObject({
      url: '/motivation/create?reel=reel-1',
      category: 'motivation',
    });
  });

  it('после отказа ведёт в мастер: там причина и правка текста', () => {
    expect(
      buildNotification({
        name: 'motivation.reel.rejected',
        recipientId: 'u1',
        reelId: 'reel-1',
        reason: 'Реклама платных курсов',
      }),
    ).toMatchObject({ url: '/motivation/create?reel=reel-1' });
  });

  it('схлопывает сообщения одного чата общим тегом', () => {
    const first = buildNotification({
      name: 'union.chat.message-sent',
      recipientId: 'u1',
      senderName: 'Вринда',
      body: 'раз',
      requestId: 'r1',
    });
    const second = buildNotification({
      name: 'union.chat.message-sent',
      recipientId: 'u1',
      senderName: 'Вринда',
      body: 'два',
      requestId: 'r1',
    });

    expect(first.tag).toBe(second.tag);
  });

  it('ведёт запрос контакта в раздел запросов справочника', () => {
    expect(
      buildNotification({
        name: 'contacts.request.received',
        recipientId: 'u1',
        senderName: 'Вринда',
      }),
    ).toEqual({
      title: 'Запрос контакта',
      body: 'Вринда просит способ связаться',
      url: '/contacts/requests',
      tag: 'contacts-requests',
      category: 'connections',
    });
  });

  it('ведёт открытые контакты на карточку того, кто их открыл', () => {
    const content = buildNotification({
      name: 'contacts.request.accepted',
      recipientId: 'u1',
      senderName: 'Вринда',
      ownerUserId: 'owner-1',
    });

    expect(content.url).toBe('/contacts/users/owner-1');
    // Формулировки без рода: User.gender необязателен.
    expect(content.body).toBe('Теперь вы видите способы связи с Вринда');
  });

  it('ведёт входящую заявку в список заявок', () => {
    expect(
      buildNotification({
        name: 'union.connection.requested',
        recipientId: 'u1',
        senderName: 'Мадхава',
      }),
    ).toEqual({
      title: 'Новая заявка',
      body: 'Мадхава хочет познакомиться',
      url: '/union/connections',
      tag: 'connections',
      category: 'connections',
    });
  });

  it('о принятой заявке пишет без указания рода', () => {
    const content = buildNotification({
      name: 'union.connection.accepted',
      recipientId: 'u1',
      senderName: 'Лалита',
      requestId: 'r7',
    });

    expect(content.body).toBe('Теперь вы можете общаться с Лалита');
    expect(content.body).not.toContain('(а)');
    expect(content.url).toBe('/union/chats/r7');
  });

  it('ведёт ответ поддержки в тикет пользователя, а не в гостевой трекер', () => {
    expect(
      buildNotification({
        name: 'support.ticket.replied',
        recipientId: 'u1',
        ticketId: 't3',
      }),
    ).toEqual({
      title: 'Ответ поддержки',
      body: 'Поддержка ответила на ваше обращение',
      url: '/support/t3',
      tag: 'support:t3',
      category: 'support',
    });
  });

  it('показывает готовую фразу дня транзитов', () => {
    expect(
      buildNotification({
        name: 'astro.transit.digest-ready',
        recipientId: 'u1',
        excerpt: 'Луна сегодня проходит вашу седьмую бхаву.',
      }),
    ).toEqual({
      title: 'Персональный день',
      body: 'Луна сегодня проходит вашу седьмую бхаву.',
      url: '/astro/chart',
      tag: 'astro-transit',
      category: 'transits',
    });
  });

  it('схлопывает дайджесты одного дня общим тегом', () => {
    // Один тег на пользователя: пересчёт того же дня заменяет уведомление,
    // а не плодит второе рядом со старым.
    const first = buildNotification({
      name: 'astro.transit.digest-ready',
      recipientId: 'u1',
      excerpt: 'Вариант A',
    });
    const second = buildNotification({
      name: 'astro.transit.digest-ready',
      recipientId: 'u1',
      excerpt: 'Вариант B',
    });

    expect(first.tag).toBe(second.tag);
  });
});

describe('toExcerpt', () => {
  it('оставляет короткое сообщение как есть и схлопывает пробелы', () => {
    expect(toExcerpt('  Харе   Кришна  ')).toBe('Харе Кришна');
  });

  it('обрезает длинное сообщение до 120 символов с многоточием', () => {
    const excerpt = toExcerpt('я'.repeat(200));

    expect(excerpt).toHaveLength(120);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});
