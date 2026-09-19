import type { CallPhase } from '@/lib/calls/call-machine';
import { canRecordVoice, isCallActive, shouldInterruptForIncomingCall } from './voice-call-guard';

const ACTIVE_PHASES: CallPhase[] = ['outgoing', 'incoming', 'connecting', 'active'];

describe('canRecordVoice', () => {
  it('можно писать только без звонка или после его конца', () => {
    expect(canRecordVoice('idle')).toBe(true);
    expect(canRecordVoice('ended')).toBe(true);
  });

  it('нельзя писать ни в одной фазе активного звонка', () => {
    for (const phase of ACTIVE_PHASES) expect(canRecordVoice(phase)).toBe(false);
  });
});

describe('isCallActive', () => {
  it('обратно canRecordVoice', () => {
    expect(isCallActive('idle')).toBe(false);
    expect(isCallActive('active')).toBe(true);
  });
});

describe('shouldInterruptForIncomingCall', () => {
  it('срабатывает только на входящем', () => {
    expect(shouldInterruptForIncomingCall('incoming')).toBe(true);
    expect(shouldInterruptForIncomingCall('outgoing')).toBe(false);
    expect(shouldInterruptForIncomingCall('active')).toBe(false);
    expect(shouldInterruptForIncomingCall('idle')).toBe(false);
  });
});
