import { shouldEndCallOnSessionChange } from './session-call-guard';
import type { CallPhase } from './call-machine';

const LIVE_PHASES: CallPhase[] = ['outgoing', 'incoming', 'connecting', 'active'];
const NOT_LIVE_PHASES: CallPhase[] = ['idle', 'ended'];

describe('shouldEndCallOnSessionChange', () => {
  it.each(LIVE_PHASES)('signed → guest, живой звонок в фазе %s — завершить', (phase) => {
    expect(shouldEndCallOnSessionChange('signed', 'guest', phase)).toBe(true);
  });

  it.each(NOT_LIVE_PHASES)('signed → guest, звонка нет (фаза %s) — нечего завершать', (phase) => {
    expect(shouldEndCallOnSessionChange('signed', 'guest', phase)).toBe(false);
  });

  it.each(LIVE_PHASES)('loading → guest (восстановление не удалось) — не наше дело, фаза %s', (phase) => {
    expect(shouldEndCallOnSessionChange('loading', 'guest', phase)).toBe(false);
  });

  it.each(LIVE_PHASES)('loading → signed (восстановились) — не выход, фаза %s', (phase) => {
    expect(shouldEndCallOnSessionChange('loading', 'signed', phase)).toBe(false);
  });

  it.each(LIVE_PHASES)('guest → signed (вход) — не выход, фаза %s', (phase) => {
    expect(shouldEndCallOnSessionChange('guest', 'signed', phase)).toBe(false);
  });

  it.each(LIVE_PHASES)('signed → signed (нет смены) — не наше дело, фаза %s', (phase) => {
    expect(shouldEndCallOnSessionChange('signed', 'signed', phase)).toBe(false);
  });

  it('guest → guest — не наше дело', () => {
    expect(shouldEndCallOnSessionChange('guest', 'guest', 'active')).toBe(false);
  });
});
