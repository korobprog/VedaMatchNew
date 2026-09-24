import { setAudioModeAsync, type AudioMode } from 'expo-audio';

/**
 * Единственный режим звука приложения (VED-331).
 *
 * Режим в `expo-audio` — не свойство плеера, а поле МОДУЛЯ, общее на весь
 * процесс: голосовые, рингтон звонка и Медиатека играют в одном режиме, и
 * последний вызов `setAudioModeAsync` побеждает. Пока звучали только
 * голосовые, режим задавал их плеер (`mixWithOthers`, без фона). С Медиатекой
 * так нельзя: голосовое, включённое во время киртана, переписало бы режим на
 * «в фоне не играть, фокус не брать», и музыка замолкала бы при первом же
 * уходе приложения в фон, а входящий звонок перестал бы её останавливать.
 *
 * Поэтому режимов ровно два, оба — ПОЛНЫМИ объектами (частичный объект на
 * Android обнуляет пропущенные поля, разбор — `voice-playback-audio-mode.ts`
 * и память о голосовых):
 *
 * - воспроизведение — всё, что играет: `doNotMix` (берём аудиофокус, чужая
 *   музыка встаёт на паузу, звонок забирает фокус у нас), фон разрешён —
 *   экран блокировки и шторка держат Медиатеку службой переднего плана;
 * - запись голосового — то же, но без фона: запись из фона Android режет, и
 *   голосовое при сворачивании отменяется (`voice-app-state-guard.ts`).
 *
 * Голосовые при этом в фоне сами не доигрывают: их плеер ставит себя на
 * паузу по `AppState` (`voice-message-player.tsx`), а не полагается на режим.
 */
export const APP_PLAYBACK_AUDIO_MODE: AudioMode = {
  playsInSilentMode: true,
  interruptionMode: 'doNotMix',
  allowsRecording: false,
  shouldPlayInBackground: true,
  shouldRouteThroughEarpiece: false,
  allowsBackgroundRecording: false,
};

export const RECORDING_AUDIO_MODE: AudioMode = {
  playsInSilentMode: true,
  interruptionMode: 'doNotMix',
  allowsRecording: true,
  shouldPlayInBackground: false,
  // Запись слушает обычный микрофон, не разговорный: это не звонок.
  shouldRouteThroughEarpiece: false,
  allowsBackgroundRecording: false,
};

/** Вернуть режим воспроизведения. Провал не мешает самому `play()`. */
export async function ensurePlaybackAudioMode(): Promise<void> {
  try {
    await setAudioModeAsync(APP_PLAYBACK_AUDIO_MODE);
  } catch {
    // Режим не переключился — `player.play()` всё равно попробует.
  }
}

/** Режим записи голосового. Провал разбирает сам `recorder.record()`. */
export async function applyRecordingAudioMode(): Promise<void> {
  try {
    await setAudioModeAsync(RECORDING_AUDIO_MODE);
  } catch {
    // Аудиосессия не поднялась — запись следом откажет понятной ошибкой.
  }
}
