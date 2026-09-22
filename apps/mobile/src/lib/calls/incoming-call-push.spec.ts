import { isIncomingCallExpired, parseCallPush } from './incoming-call-push';

const incomingData = {
  type: 'call.incoming',
  callId: 'call-1',
  conversationId: 'conv-1',
  kind: 'video',
  callerName: 'Кришна Дас',
  callerAvatarUrl: 'https://cdn.example/avatar.jpg',
  expiresAt: '2026-09-17T12:00:45.000Z',
};

describe('parseCallPush', () => {
  it('разбирает входящий звонок целиком', () => {
    expect(parseCallPush(incomingData)).toEqual({
      type: 'call.incoming',
      callId: 'call-1',
      conversationId: 'conv-1',
      kind: 'video',
      callerName: 'Кришна Дас',
      callerAvatarUrl: 'https://cdn.example/avatar.jpg',
      expiresAt: '2026-09-17T12:00:45.000Z',
    });
  });

  it('аватар отсутствует — null, а не пустая строка', () => {
    const { callerAvatarUrl, ...withoutAvatar } = incomingData;
    void callerAvatarUrl;
    expect(parseCallPush(withoutAvatar)).toEqual({ ...incomingData, callerAvatarUrl: null });
  });

  it('разбирает «звонок снят»', () => {
    expect(parseCallPush({ type: 'call.ended', callId: 'call-1', reason: 'declined' })).toEqual({
      type: 'call.ended',
      callId: 'call-1',
      reason: 'declined',
    });
  });

  it('неизвестный type — null', () => {
    expect(parseCallPush({ type: 'chat.message', callId: 'call-1' })).toBeNull();
  });

  it('нет data вовсе — null', () => {
    expect(parseCallPush(null)).toBeNull();
    expect(parseCallPush(undefined)).toBeNull();
  });

  it('не хватает обязательного поля — null, не падает', () => {
    const { callId, ...rest } = incomingData;
    void callId;
    expect(parseCallPush(rest)).toBeNull();
  });

  it('kind не audio/video — null', () => {
    expect(parseCallPush({ ...incomingData, kind: 'screen' })).toBeNull();
  });

  it('call.ended без reason — null', () => {
    expect(parseCallPush({ type: 'call.ended', callId: 'call-1' })).toBeNull();
  });
});

describe('isIncomingCallExpired', () => {
  const push = parseCallPush(incomingData);
  if (push?.type !== 'call.incoming') throw new Error('фикстура должна разобраться');

  it('до истечения — не просрочен', () => {
    expect(isIncomingCallExpired(push, Date.parse('2026-09-17T12:00:00.000Z'))).toBe(false);
  });

  it('в момент истечения — уже просрочен', () => {
    expect(isIncomingCallExpired(push, Date.parse(push.expiresAt))).toBe(true);
  });

  it('после истечения — просрочен', () => {
    expect(isIncomingCallExpired(push, Date.parse('2026-09-17T13:00:00.000Z'))).toBe(true);
  });

  it('дата не разбирается — просрочен на всякий случай', () => {
    expect(isIncomingCallExpired({ ...push, expiresAt: 'не дата' }, Date.now())).toBe(true);
  });
});

/**
 * Оповещение о групповом звонке (VED-293) приходит обычным пушем: у него
 * есть блок `notification`, а в `data` — только `{ url, tag }`
 * (`apps/api/.../notifications/fcm.ts`, `buildFcmMessage`). Распознаться как
 * нативный вызов оно не должно ни при каких обстоятельствах: полноэкранный
 * входящий с рингтоном на комнату, в которую входят и выходят по ходу, —
 * ровно то, чего этап 3 избегает.
 */
describe('групповой звонок нативным вызовом не притворяется', () => {
  it('обычный пуш о звонке в беседе не разбирается как вызов', () => {
    expect(
      parseCallPush({ url: '/chat/conv-1', tag: 'group-call:room-1' }),
    ).toBeNull();
  });

  it('незнакомый type не разбирается как вызов', () => {
    expect(
      parseCallPush({ type: 'group-call.started', callId: 'room-1' }),
    ).toBeNull();
  });
});
