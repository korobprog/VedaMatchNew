/**
 * Скорость голосовых (VED-197): одна кнопка, которая идёт по кругу
 * 1× → 1.5× → 2× → 2.5× → 3× → 1×, как в мессенджерах. Значение одно на
 * устройство и на все голосовые сразу: человек, который слушает на 2×,
 * слушает так всю переписку, а не одно сообщение.
 *
 * Здесь только чистая логика — цикл, разбор сохранённого и подпись, — чтобы
 * её можно было проверить без `<audio>` и `localStorage`.
 */

export const VOICE_SPEEDS = [1, 1.5, 2, 2.5, 3] as const;

export type VoiceSpeed = (typeof VOICE_SPEEDS)[number];

export const DEFAULT_VOICE_SPEED: VoiceSpeed = 1;

export const VOICE_SPEED_KEY = "vedamatch:chat-voice-speed";

/** Следующая скорость по кругу. Неизвестное значение начинает круг сначала. */
export function nextVoiceSpeed(current: number): VoiceSpeed {
  const index = VOICE_SPEEDS.indexOf(current as VoiceSpeed);
  if (index < 0) return VOICE_SPEEDS[1];
  return VOICE_SPEEDS[(index + 1) % VOICE_SPEEDS.length];
}

/**
 * Разбор значения из хранилища. Всё, чего нет в списке, — скорость по
 * умолчанию: старое или испорченное значение не должно включать 7×.
 */
export function parseVoiceSpeed(raw: string | null | undefined): VoiceSpeed {
  if (raw == null || raw.trim() === "") return DEFAULT_VOICE_SPEED;
  const value = Number(raw);
  return VOICE_SPEEDS.find((speed) => speed === value) ?? DEFAULT_VOICE_SPEED;
}

/** Подпись на кнопке: «1×», «1.5×». */
export function formatVoiceSpeed(speed: number): string {
  return `${String(speed)}×`;
}
