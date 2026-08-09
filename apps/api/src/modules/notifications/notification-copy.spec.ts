import { toNotificationExcerpt } from '@vedamatch/shared';
import { buildNotification } from './notification-copy';

describe('buildNotification', () => {
  it('показывает имя отправителя и начало сообщения', () => {
    expect(
      buildNotification({
        name: 'union.chat.message-sent',
        recipientId: 'u1',
        senderName: 'Вринда',
        excerpt: 'Харе Кришна, как ваша садхана?',
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

  it('схлопывает сообщения одного чата общим тегом', () => {
    const first = buildNotification({
      name: 'union.chat.message-sent',
      recipientId: 'u1',
      senderName: 'Вринда',
      excerpt: 'раз',
      requestId: 'r1',
    });
    const second = buildNotification({
      name: 'union.chat.message-sent',
      recipientId: 'u1',
      senderName: 'Вринда',
      excerpt: 'два',
      requestId: 'r1',
    });

    expect(first.tag).toBe(second.tag);
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
});

describe('toNotificationExcerpt', () => {
  it('оставляет короткое сообщение как есть и схлопывает пробелы', () => {
    expect(toNotificationExcerpt('  Харе   Кришна  ')).toBe('Харе Кришна');
  });

  it('обрезает длинное сообщение до 120 символов с многоточием', () => {
    const excerpt = toNotificationExcerpt('я'.repeat(200));

    expect(excerpt).toHaveLength(120);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});
