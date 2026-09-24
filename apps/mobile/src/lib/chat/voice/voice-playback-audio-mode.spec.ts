const mockSetAudioModeAsync = jest.fn();

jest.mock('expo-audio', () => ({
  __esModule: true,
  setAudioModeAsync: (...args: unknown[]) => mockSetAudioModeAsync(...args),
}));

import { ensurePlaybackAudioMode, PLAYBACK_AUDIO_MODE } from './voice-playback-audio-mode';

/**
 * Настоящий дефект, найденный чтением исходников `expo-audio`/
 * `expo-modules-core` (Android): частичный объект в `setAudioModeAsync`
 * (`{ allowsRecording: false }`) откатывает ГЛОБАЛЬНОЕ поле модуля
 * `playsInSilentMode` в JVM-дефолт `false` вместо документированного
 * `true`, потому что `RecordTypeConverter` заполняет только присланные из
 * JS ключи поверх «пусто аллоцированного» объекта, не выполняя тело
 * Kotlin-конструктора с его `= true`. `PLAYBACK_AUDIO_MODE` обязан
 * перечислять ВСЕ поля явно — тест ловит случайный возврат к частичному
 * объекту при будущей правке.
 */
describe('PLAYBACK_AUDIO_MODE', () => {
  it('перечисляет playsInSilentMode явно и правдиво (true) — не полагается на Kotlin-дефолт, который Record-конвертация не применяет', () => {
    expect(PLAYBACK_AUDIO_MODE.playsInSilentMode).toBe(true);
  });

  it('перечисляет все поля, которые трогает запись, — ни одно не должно остаться "как получится"', () => {
    // С VED-331 режим общий с Медиатекой: фокус берётся (`doNotMix`), фон
    // не выключается — иначе голосовое глушило бы музыку при сворачивании.
    expect(PLAYBACK_AUDIO_MODE).toEqual({
      allowsRecording: false,
      allowsBackgroundRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'doNotMix',
    });
  });
});

describe('ensurePlaybackAudioMode', () => {
  beforeEach(() => {
    mockSetAudioModeAsync.mockReset();
  });

  it('вызывает setAudioModeAsync с полным объектом режима', async () => {
    mockSetAudioModeAsync.mockResolvedValue(undefined);
    await ensurePlaybackAudioMode();
    expect(mockSetAudioModeAsync).toHaveBeenCalledWith(PLAYBACK_AUDIO_MODE);
  });

  it('провал переключения режима не бросает наружу — воспроизведение не должно зависеть от его успеха', async () => {
    mockSetAudioModeAsync.mockRejectedValue(new Error('boom'));
    await expect(ensurePlaybackAudioMode()).resolves.toBeUndefined();
  });
});
