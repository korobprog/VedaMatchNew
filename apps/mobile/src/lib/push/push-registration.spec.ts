import {
  pushRegistration,
  resetPushRegistration,
  setPushRegistration,
  subscribePushRegistration,
} from './push-registration';

describe('push-registration', () => {
  beforeEach(() => resetPushRegistration());

  it('до первой попытки итог неизвестен', () => {
    expect(pushRegistration()).toBe('unknown');
  });

  it('новое значение будит подписчиков', () => {
    const seen: string[] = [];
    subscribePushRegistration(() => seen.push(pushRegistration()));

    setPushRegistration('no-permission');
    setPushRegistration('registered');

    expect(seen).toEqual(['no-permission', 'registered']);
  });

  it('повтор того же значения никого не будит: иначе раздел перерисовывался бы зря', () => {
    let calls = 0;
    subscribePushRegistration(() => (calls += 1));

    setPushRegistration('failed');
    setPushRegistration('failed');

    expect(calls).toBe(1);
  });

  it('отписка работает', () => {
    let calls = 0;
    const unsubscribe = subscribePushRegistration(() => (calls += 1));

    unsubscribe();
    setPushRegistration('registered');

    expect(calls).toBe(0);
  });

  it('подписчик, отписавшийся во время рассылки, не ломает её остальным', () => {
    const seen: string[] = [];
    const unsubscribe = subscribePushRegistration(() => {
      seen.push('first');
      unsubscribe();
    });
    subscribePushRegistration(() => seen.push('second'));

    setPushRegistration('registered');

    expect(seen).toEqual(['first', 'second']);
  });
});
