import { BadRequestException } from '@nestjs/common';
import {
  MOTIVATION_VOICES,
  type MotivationReelVideoOptions,
} from '@vedamatch/shared';

/**
 * Разбор настроек ролика, которые задаёт автор рилса. Набор намеренно узкий:
 * голос, музыка и длина — всё, что человек может решить, не разбираясь в
 * моделях и промптах. Движение в кадре — три пресета вместо свободного текста.
 */

/** Длина ролика: пусто — посчитаем по озвучке или времени чтения. */
export const REEL_VIDEO_SECONDS = [5, 10, 15] as const;
export type ReelVideoSeconds = (typeof REEL_VIDEO_SECONDS)[number];

export const REEL_MOTION_PRESETS = {
  calm: {
    label: 'Спокойное дыхание',
    prompt:
      'Very slow, calm motion: gentle breathing of the scene, soft light shifting, leaves and fabric barely moving. No camera cuts, no new objects.',
  },
  nature: {
    label: 'Ветер и свет',
    prompt:
      'Wind moves through the scene: grass, water and cloth sway softly, light flickers and shifts. Camera stays still. No new objects, no cuts.',
  },
  zoom: {
    label: 'Медленный наезд',
    prompt:
      'Extremely slow push-in on the center of the frame, everything else nearly still. No cuts, no new objects.',
  },
} as const;

export type ReelMotionPreset = keyof typeof REEL_MOTION_PRESETS;

export interface ParsedReelVideoOptions {
  videoVoice: boolean;
  videoVoiceName: string | null;
  videoTrackId: string | null;
  videoSeconds: number | null;
  videoPrompt: string | null;
}

const voices = new Set<string>(MOTIVATION_VOICES);
const seconds = new Set<number>(REEL_VIDEO_SECONDS);

export function parseReelVideoOptions(
  input: MotivationReelVideoOptions | undefined,
): ParsedReelVideoOptions {
  const voice = input?.voice ?? null;
  if (voice !== null && !voices.has(voice))
    throw new BadRequestException('Неизвестный голос озвучки');

  const length = input?.seconds ?? null;
  if (length !== null && !seconds.has(length))
    throw new BadRequestException(
      `Длина ролика — ${REEL_VIDEO_SECONDS.join(', ')} секунд или «как получится»`,
    );

  const motion = input?.motion ?? null;
  if (motion !== null && !(motion in REEL_MOTION_PRESETS))
    throw new BadRequestException('Неизвестное движение в кадре');

  const trackId = input?.trackId?.trim() || null;

  return {
    // Голос выбран — значит озвучка нужна; «без голоса» и есть выключенная озвучка.
    videoVoice: voice !== null,
    videoVoiceName: voice,
    videoTrackId: trackId,
    videoSeconds: length,
    videoPrompt: motion ? REEL_MOTION_PRESETS[motion].prompt : null,
  };
}

/** Список пресетов движения для интерфейса. */
export const motionOptions = Object.entries(REEL_MOTION_PRESETS).map(
  ([value, preset]) => ({
    value: value as ReelMotionPreset,
    label: preset.label,
  }),
);
