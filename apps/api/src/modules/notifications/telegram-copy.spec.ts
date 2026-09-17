import type { NotificationEvent } from '@vedamatch/shared';
import type { NotificationContent } from './notification-copy';
import { buildTelegramNotificationText } from './telegram-copy';

describe('buildTelegramNotificationText', () => {
  it('входящий звонок — эмодзи и явное «от кого» вместо короткой подписи', () => {
    const content: NotificationContent = {
      title: 'Радха',
      body: 'Входящий аудиозвонок',
      url: '/chat/conv1?call=call1',
      tag: 'call:call1',
      category: 'chat',
    };
    const event: NotificationEvent = {
      name: 'chat.call-incoming',
      recipientId: 'u1',
      callerName: 'Радха',
      callerAvatarUrl: null,
      callId: 'call1',
      conversationId: 'conv1',
      callKind: 'audio',
      expiresAt: '2026-09-18T10:00:45.000Z',
    };

    expect(buildTelegramNotificationText(content, event)).toEqual({
      title: 'Радха',
      body: '📞 Входящий звонок от Радха',
    });
  });

  it('остальные события — текст как в браузерном пуше', () => {
    const content: NotificationContent = {
      title: 'Нитай',
      body: 'Привет!',
      url: '/chat/conv1',
      tag: 'chat:conv1',
      category: 'chat',
    };
    const event: NotificationEvent = {
      name: 'chat.message-sent',
      recipientId: 'u1',
      senderName: 'Нитай',
      body: 'Привет!',
      conversationId: 'conv1',
    };

    expect(buildTelegramNotificationText(content, event)).toEqual({
      title: 'Нитай',
      body: 'Привет!',
    });
  });
});
