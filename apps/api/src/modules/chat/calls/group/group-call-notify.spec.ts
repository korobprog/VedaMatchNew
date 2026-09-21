import {
  GROUP_CALL_NOTIFY_COOLDOWN_MS,
  GROUP_CALL_RECENT_LEAVE_MS,
  groupCallNotifyTargets,
  mayNotifyRoom,
  notifyCooldownThreshold,
  type NotifyCandidate,
} from './group-call-notify';

const NOW = 1_700_000_000_000;

function candidate(
  userId: string,
  overrides: Partial<NotifyCandidate> = {},
): NotifyCandidate {
  return {
    userId,
    leftConversation: false,
    mutedUntil: null,
    inRoom: false,
    leftRoomAt: null,
    viewing: false,
    ...overrides,
  };
}

describe('groupCallNotifyTargets · кого будить', () => {
  it('зовёт участников беседы, которых в комнате нет', () => {
    expect(
      groupCallNotifyTargets(
        [candidate('a', { inRoom: true }), candidate('b'), candidate('c')],
        NOW,
      ),
    ).toEqual(['b', 'c']);
  });

  it('не зовёт того, кто уже разговаривает', () => {
    expect(
      groupCallNotifyTargets(
        [candidate('a', { inRoom: true }), candidate('b', { inRoom: true })],
        NOW,
      ),
    ).toEqual([]);
  });

  it('не зовёт ушедшего из беседы', () => {
    expect(
      groupCallNotifyTargets(
        [candidate('a', { leftConversation: true }), candidate('b')],
        NOW,
      ),
    ).toEqual(['b']);
  });

  it('молчит у того, кто заглушил беседу', () => {
    expect(
      groupCallNotifyTargets(
        [candidate('a', { mutedUntil: NOW + 60_000 }), candidate('b')],
        NOW,
      ),
    ).toEqual(['b']);
  });

  it('истёкшее глушение молчать больше не заставляет', () => {
    expect(
      groupCallNotifyTargets([candidate('a', { mutedUntil: NOW - 1 })], NOW),
    ).toEqual(['a']);
  });

  it('не зовёт того, кто смотрит беседу: плашка у него на экране', () => {
    expect(
      groupCallNotifyTargets(
        [candidate('a', { viewing: true }), candidate('b')],
        NOW,
      ),
    ).toEqual(['b']);
  });

  it('не зовёт обратно того, кто только что вышел из комнаты', () => {
    expect(
      groupCallNotifyTargets(
        [candidate('a', { leftRoomAt: NOW - GROUP_CALL_RECENT_LEAVE_MS + 1 })],
        NOW,
      ),
    ).toEqual([]);
  });

  it('вышедшего давно зовёт снова: разговор мог начаться заново', () => {
    expect(
      groupCallNotifyTargets(
        [candidate('a', { leftRoomAt: NOW - GROUP_CALL_RECENT_LEAVE_MS - 1 })],
        NOW,
      ),
    ).toEqual(['a']);
  });

  it('сохраняет порядок беседы, а не порядок правил', () => {
    expect(
      groupCallNotifyTargets(
        [candidate('z'), candidate('m', { inRoom: true }), candidate('a')],
        NOW,
      ),
    ).toEqual(['z', 'a']);
  });

  it('пустая беседа никого не будит', () => {
    expect(groupCallNotifyTargets([], NOW)).toEqual([]);
  });
});

describe('mayNotifyRoom · как часто комната имеет право будить', () => {
  it('первая волна уходит всегда', () => {
    expect(mayNotifyRoom(null, NOW)).toBe(true);
  });

  it('вход следом за первым новой волны не даёт', () => {
    expect(mayNotifyRoom(NOW - 1000, NOW)).toBe(false);
  });

  it('ровно на границе окна напоминание разрешено', () => {
    expect(mayNotifyRoom(NOW - GROUP_CALL_NOTIFY_COOLDOWN_MS, NOW)).toBe(true);
  });

  it('за миллисекунду до границы — ещё нет', () => {
    expect(mayNotifyRoom(NOW - GROUP_CALL_NOTIFY_COOLDOWN_MS + 1, NOW)).toBe(
      false,
    );
  });
});

describe('notifyCooldownThreshold', () => {
  it('отдаёт тот же порог, по которому решает mayNotifyRoom', () => {
    const threshold = notifyCooldownThreshold(NOW);
    expect(threshold.getTime()).toBe(NOW - GROUP_CALL_NOTIFY_COOLDOWN_MS);
    // Условие запроса `notifiedAt < threshold` и ответ `mayNotifyRoom`
    // обязаны совпадать: иначе сервис забирал бы право на рассылку там, где
    // правило его не даёт.
    expect(mayNotifyRoom(threshold.getTime() - 1, NOW)).toBe(true);
    expect(mayNotifyRoom(threshold.getTime() + 1, NOW)).toBe(false);
  });
});
