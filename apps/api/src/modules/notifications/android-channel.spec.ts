import type { NotificationCategory } from '@vedamatch/shared';
import {
  androidChannelFor,
  ANDROID_CALLS_CHANNEL_ID,
  ANDROID_MESSAGES_CHANNEL_ID,
} from './android-channel';
import { buildFcmMessage } from './fcm';

const payload = {
  title: 'Радха',
  body: 'Входящий аудиозвонок',
  url: '/chat/conv-1?call=call-1',
  tag: 'call:call-1',
};

describe('androidChannelFor', () => {
  it('звонки — в свой канал', () => {
    expect(androidChannelFor('calls')).toBe('calls');
  });

  it('переписка — в канал сообщений', () => {
    expect(androidChannelFor('chat')).toBe('messages');
  });

  it('все прочие категории — в канал сообщений', () => {
    const others: NotificationCategory[] = [
      'announcements',
      'notices',
      'connections',
      'support',
      'transits',
      'market',
      'motivation',
      'music',
      'work',
      'travel',
    ];
    for (const category of others) {
      expect(androidChannelFor(category)).toBe(ANDROID_MESSAGES_CHANNEL_ID);
    }
  });

  it('каналы различимы: один тумблер в системе не гасит оба', () => {
    expect(ANDROID_CALLS_CHANNEL_ID).not.toBe(ANDROID_MESSAGES_CHANNEL_ID);
  });
});

describe('buildFcmMessage — канал в сообщении', () => {
  it('без указания канала уходит в «Сообщения», как было до VED-361', () => {
    expect(buildFcmMessage('t1', payload).message.android.notification).toEqual(
      { channel_id: 'messages', tag: 'call:call-1' },
    );
  });

  it('канал звонков доезжает до FCM', () => {
    const message = buildFcmMessage('t1', payload, ANDROID_CALLS_CHANNEL_ID);
    expect(message.message.android.notification.channel_id).toBe('calls');
    // Остальное сообщение не меняется: канал — единственное отличие.
    expect(message.message.notification).toEqual({
      title: 'Радха',
      body: 'Входящий аудиозвонок',
    });
    expect(message.message.android.priority).toBe('high');
  });
});
