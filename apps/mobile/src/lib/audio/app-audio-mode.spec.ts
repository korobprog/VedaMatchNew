const mockSetAudioModeAsync = jest.fn();

jest.mock('expo-audio', () => ({
  __esModule: true,
  setAudioModeAsync: (...args: unknown[]) => mockSetAudioModeAsync(...args),
}));

import {
  APP_PLAYBACK_AUDIO_MODE,
  RECORDING_AUDIO_MODE,
  applyRecordingAudioMode,
  ensurePlaybackAudioMode,
} from './app-audio-mode';

/**
 * Режим звука общий на процесс: все поля объявлены явно (частичный объект
 * на Android обнуляет пропущенные), и у воспроизведения и записи совпадает
 * всё, кроме фона и записи.
 */
const FIELDS = [
  'allowsBackgroundRecording',
  'allowsRecording',
  'interruptionMode',
  'playsInSilentMode',
  'shouldPlayInBackground',
  'shouldRouteThroughEarpiece',
];

describe('режимы звука приложения', () => {
  beforeEach(() => mockSetAudioModeAsync.mockReset().mockResolvedValue(undefined));

  it('оба режима — полные объекты', () => {
    expect(Object.keys(APP_PLAYBACK_AUDIO_MODE).sort()).toEqual(FIELDS);
    expect(Object.keys(RECORDING_AUDIO_MODE).sort()).toEqual(FIELDS);
  });

  it('воспроизведение: фон разрешён, фокус берём, тихий режим не глушит', () => {
    expect(APP_PLAYBACK_AUDIO_MODE.shouldPlayInBackground).toBe(true);
    // `mixWithOthers` на Android вовсе не берёт фокус — звонок тогда не
    // остановил бы Медиатеку.
    expect(APP_PLAYBACK_AUDIO_MODE.interruptionMode).toBe('doNotMix');
    expect(APP_PLAYBACK_AUDIO_MODE.playsInSilentMode).toBe(true);
    expect(APP_PLAYBACK_AUDIO_MODE.shouldRouteThroughEarpiece).toBe(false);
  });

  it('запись: без фона, с микрофоном', () => {
    expect(RECORDING_AUDIO_MODE.shouldPlayInBackground).toBe(false);
    expect(RECORDING_AUDIO_MODE.allowsRecording).toBe(true);
    expect(RECORDING_AUDIO_MODE.playsInSilentMode).toBe(true);
  });

  it('ensurePlaybackAudioMode передаёт полный объект и не бросает', async () => {
    await ensurePlaybackAudioMode();
    expect(mockSetAudioModeAsync).toHaveBeenCalledWith(APP_PLAYBACK_AUDIO_MODE);
    mockSetAudioModeAsync.mockRejectedValue(new Error('boom'));
    await expect(ensurePlaybackAudioMode()).resolves.toBeUndefined();
  });

  it('applyRecordingAudioMode передаёт режим записи и не бросает', async () => {
    await applyRecordingAudioMode();
    expect(mockSetAudioModeAsync).toHaveBeenCalledWith(RECORDING_AUDIO_MODE);
    mockSetAudioModeAsync.mockRejectedValue(new Error('boom'));
    await expect(applyRecordingAudioMode()).resolves.toBeUndefined();
  });
});
