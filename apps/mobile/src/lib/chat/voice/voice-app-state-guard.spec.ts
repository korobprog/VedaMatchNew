import { shouldCancelRecordingForAppState, shouldPausePlaybackForAppState } from './voice-app-state-guard';

describe('shouldCancelRecordingForAppState', () => {
  it('срабатывает только когда приложение реально ушло в фон', () => {
    expect(shouldCancelRecordingForAppState('background')).toBe(true);
  });

  it('не срабатывает на активном состоянии или мимолётном inactive', () => {
    expect(shouldCancelRecordingForAppState('active')).toBe(false);
    expect(shouldCancelRecordingForAppState('inactive')).toBe(false);
    expect(shouldCancelRecordingForAppState('unknown')).toBe(false);
  });
});

describe('shouldPausePlaybackForAppState', () => {
  it('то же правило, что для записи — уход в фон ставит на паузу', () => {
    expect(shouldPausePlaybackForAppState('background')).toBe(true);
    expect(shouldPausePlaybackForAppState('active')).toBe(false);
  });
});
