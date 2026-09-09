import { isFinal, roleOf, transition } from './call-state';

describe('transition', () => {
  it('принять может только вызываемый и только во время дозвона', () => {
    expect(transition('ringing', 'accept', 'callee')).toEqual({
      status: 'accepted',
      endReason: null,
    });
    expect(transition('ringing', 'accept', 'caller')).toBeNull();
    expect(transition('accepted', 'accept', 'callee')).toBeNull();
  });

  it('отклонить — вызываемый во время дозвона', () => {
    expect(transition('ringing', 'decline', 'callee')?.status).toBe('declined');
    expect(transition('ringing', 'decline', 'caller')).toBeNull();
  });

  it('положить трубку во время дозвона: звонивший отменяет, вызываемый отклоняет', () => {
    expect(transition('ringing', 'end', 'caller')?.status).toBe('cancelled');
    expect(transition('ringing', 'end', 'callee')?.status).toBe('declined');
  });

  it('из принятого завершает любая сторона; обрыв сети — failed', () => {
    expect(transition('accepted', 'end', 'caller')).toEqual({
      status: 'ended',
      endReason: 'hangup',
    });
    expect(transition('accepted', 'end', 'callee', 'network')).toEqual({
      status: 'failed',
      endReason: 'network',
    });
  });

  it('таймер переводит дозвон в пропущенный, принятый не трогает', () => {
    expect(transition('ringing', 'timeout', 'caller')?.status).toBe('missed');
    expect(transition('accepted', 'timeout', 'caller')).toBeNull();
  });

  it('из финального состояния выхода нет', () => {
    for (const status of [
      'declined',
      'missed',
      'cancelled',
      'ended',
      'failed',
    ] as const) {
      expect(isFinal(status)).toBe(true);
      expect(transition(status, 'end', 'caller')).toBeNull();
      expect(transition(status, 'accept', 'callee')).toBeNull();
    }
    expect(isFinal('ringing')).toBe(false);
    expect(isFinal('accepted')).toBe(false);
  });
});

describe('roleOf', () => {
  const call = { callerId: 'a', calleeId: 'b' };
  it('различает стороны и чужого', () => {
    expect(roleOf(call, 'a')).toBe('caller');
    expect(roleOf(call, 'b')).toBe('callee');
    expect(roleOf(call, 'c')).toBeNull();
  });
});
