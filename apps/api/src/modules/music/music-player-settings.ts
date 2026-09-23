import {
  MUSIC_DEFAULT_SEEK_STEP,
  MUSIC_SEEK_STEPS,
  isMusicSeekStep,
  type UpdateMusicSettingsRequest,
} from '@vedamatch/shared';

/**
 * Настройки плеера в `MusicSettings` (VED-388): шаги перемотки и то, какие
 * кнопки вынесены на полосу.
 *
 * Чистым модулем и под тестом: разбор приходящего тела — единственное место,
 * где «перемотка на 37 секунд» или строка вместо булева могли бы попасть в
 * базу, а проверять это через контроллер дороже, чем на объектах.
 */

export const PLAYER_SETTINGS_DEFAULTS = {
  seekBackSeconds: MUSIC_DEFAULT_SEEK_STEP as number,
  seekForwardSeconds: MUSIC_DEFAULT_SEEK_STEP as number,
  playerShowSeek: false,
  playerShowBookmark: false,
  playerShowHistory: false,
};

export type PlayerSettingsPatch = Partial<typeof PLAYER_SETTINGS_DEFAULTS>;

const FLAGS = ['playerShowSeek', 'playerShowBookmark', 'playerShowHistory'] as const;
const STEPS = ['seekBackSeconds', 'seekForwardSeconds'] as const;

/**
 * Часть тела запроса, относящаяся к плееру. Отсутствующие поля не трогаем
 * (частичное обновление), присланные с мусором — отказ с понятной причиной,
 * а не молчаливое «сохранилось, но не то».
 */
export function parsePlayerSettingsPatch(
  body: UpdateMusicSettingsRequest,
): { patch: PlayerSettingsPatch } | { error: string } {
  const patch: PlayerSettingsPatch = {};

  for (const key of STEPS) {
    const value = body[key];
    if (value === undefined) continue;
    if (!isMusicSeekStep(value)) {
      return {
        error: `Шаг перемотки — одно из: ${MUSIC_SEEK_STEPS.join(', ')} секунд`,
      };
    }
    patch[key] = value;
  }

  for (const key of FLAGS) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') {
      return { error: 'Выключатель кнопки плеера — только да или нет' };
    }
    patch[key] = value;
  }

  return { patch };
}

/**
 * Значение из базы — наружу. Если в колонке окажется шаг, которого больше
 * нет в списке (список сократили), отдаём умолчание: кнопка «назад на 45»
 * при выборе из 5/10/15/30/60 выглядела бы сбоем, а не настройкой.
 */
export function playerSettingsFromRow(row: {
  seekBackSeconds: number;
  seekForwardSeconds: number;
  playerShowSeek: boolean;
  playerShowBookmark: boolean;
  playerShowHistory: boolean;
}) {
  return {
    seekBackSeconds: isMusicSeekStep(row.seekBackSeconds)
      ? row.seekBackSeconds
      : PLAYER_SETTINGS_DEFAULTS.seekBackSeconds,
    seekForwardSeconds: isMusicSeekStep(row.seekForwardSeconds)
      ? row.seekForwardSeconds
      : PLAYER_SETTINGS_DEFAULTS.seekForwardSeconds,
    playerShowSeek: row.playerShowSeek,
    playerShowBookmark: row.playerShowBookmark,
    playerShowHistory: row.playerShowHistory,
  };
}
