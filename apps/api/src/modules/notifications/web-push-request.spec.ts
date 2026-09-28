import {
  describePushFailure,
  pushServiceOf,
  webPushOptions,
} from './web-push-request';

describe('pushServiceOf', () => {
  it('узнаёт Apple — Safari на iPhone с домашнего экрана и на Mac', () => {
    expect(pushServiceOf('https://web.push.apple.com/QGx1c2VyLWlk')).toBe(
      'apple',
    );
  });

  it('узнаёт FCM, Mozilla и Windows', () => {
    expect(pushServiceOf('https://fcm.googleapis.com/fcm/send/abc')).toBe(
      'fcm',
    );
    expect(
      pushServiceOf('https://updates.push.services.mozilla.com/wpush/v2/x'),
    ).toBe('mozilla');
    expect(
      pushServiceOf('https://wns2-db5p.notify.windows.com/w/?token='),
    ).toBe('microsoft');
  });

  it('не путает похожий чужой хост со службой доставки', () => {
    expect(pushServiceOf('https://push.apple.com.evil.example/x')).toBe(
      'other',
    );
    expect(pushServiceOf('https://notpush.apple.com/x')).toBe('other');
  });

  it('мусор вместо адреса — «other», а не исключение', () => {
    expect(pushServiceOf('')).toBe('other');
    expect(pushServiceOf('не адрес')).toBe('other');
  });
});

describe('webPushOptions', () => {
  it('входящий звонок живёт у службы доставки 45 секунд, как нативный', () => {
    expect(webPushOptions({ tag: 'call:c-1' })).toEqual({
      TTL: 45,
      urgency: 'high',
    });
  });

  it('пропущенный звонок и сообщение — не входящий: срок четыре недели', () => {
    const fourWeeks = 4 * 7 * 24 * 60 * 60;
    expect(webPushOptions({ tag: 'call-missed:conv-1' }).TTL).toBe(fourWeeks);
    expect(webPushOptions({ tag: 'chat:conv-1' }).TTL).toBe(fourWeeks);
    expect(webPushOptions({}).TTL).toBe(fourWeeks);
  });

  it('срочность всегда высокая: пуш портала — не фоновая рассылка', () => {
    expect(webPushOptions({ tag: 'welcome' }).urgency).toBe('high');
    expect(webPushOptions({ tag: 42 }).urgency).toBe('high');
  });
});

describe('describePushFailure', () => {
  it('несёт причину отказа Apple из тела ответа', () => {
    expect(describePushFailure('apple', 403, '{"reason":"BadJwtToken"}')).toBe(
      'apple, 403: {"reason":"BadJwtToken"}',
    );
  });

  it('без тела и без кода — не пустая строка', () => {
    expect(describePushFailure('fcm', undefined, undefined)).toBe(
      'fcm, без кода',
    );
    expect(describePushFailure('other', 500, '   ')).toBe('other, 500');
  });

  it('обрезает длинное тело', () => {
    const line = describePushFailure('apple', 400, 'x'.repeat(1000));
    expect(line.length).toBeLessThan(220);
  });
});
