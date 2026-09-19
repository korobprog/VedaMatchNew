/**
 * Скорость воспроизведения голосовых (VED-197 на сайте, здесь — VED-286).
 * Только 1×/1.5×/2×, не полный набор сайта (1/1.5/2/2.5/3): `AudioPlayer.
 * playbackRate` из `expo-audio` документирован до 2.0 на Android
 * (`node_modules/expo-audio/src/AudioModule.types.ts`), выше — не
 * гарантировано ни библиотекой, ни `ExoPlayer` под капотом.
 *
 * Одна скорость на устройство и на все голосовые сразу, как на сайте —
 * хранит `voice-speed-store.ts` (SecureStore вместо `localStorage`, спека
 * не покрывает: обёртка над постоянным хранилищем, чистая логика — здесь).
 */

export const VOICE_SPEEDS = [1, 1.5, 2] as const;

export type VoiceSpeed = (typeof VOICE_SPEEDS)[number];

export const DEFAULT_VOICE_SPEED: VoiceSpeed = 1;

export const VOICE_SPEED_STORAGE_KEY = 'vm.chatVoiceSpeed';

/** Следующая скорость по кругу. Неизвестное значение начинает круг сначала. */
export function nextVoiceSpeed(current: number): VoiceSpeed {
  const index = VOICE_SPEEDS.indexOf(current as VoiceSpeed);
  if (index < 0) return VOICE_SPEEDS[1];
  return VOICE_SPEEDS[(index + 1) % VOICE_SPEEDS.length];
}

/** Всё, чего нет в списке (включая старое сайтовое «3»), — скорость по умолчанию. */
export function parseVoiceSpeed(raw: string | null | undefined): VoiceSpeed {
  if (raw == null || raw.trim() === '') return DEFAULT_VOICE_SPEED;
  const value = Number(raw);
  return VOICE_SPEEDS.find((speed) => speed === value) ?? DEFAULT_VOICE_SPEED;
}

/** Подпись на кнопке: «1×», «1.5×». */
export function formatVoiceSpeed(speed: number): string {
  return `${String(speed)}×`;
}
