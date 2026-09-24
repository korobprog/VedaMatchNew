import {
  MUSIC_DEFAULT_SEEK_STEP,
  isMusicSeekStep,
  type MusicSettingsDto,
  type UpdateMusicSettingsRequest,
} from "@vedamatch/shared";
import { plural } from "@/lib/plural";

/**
 * Настройки плеера (VED-388): шаги перемотки и кнопки, вынесенные на полосу.
 *
 * Живут на сервере, в `MusicSettings`: настроил полосу на телефоне — та же
 * полоса и на ноутбуке, а `localStorage` у каждого браузера свой. Копия в
 * `localStorage` — только ради первой отрисовки: без неё вынесенные кнопки
 * появлялись бы через полсекунды после полосы, и полоса прыгала бы по
 * высоте на каждой странице.
 *
 * Чистым модулем и под тестом: разбор копии из хранилища и подписи кнопок —
 * места, где ошибку видно только глазами на телефоне.
 */

export interface PlayerPrefs {
  seekBackSeconds: number;
  seekForwardSeconds: number;
  /** Кнопки перемотки на полосе на телефоне и планшете (на широком — всегда). */
  showSeek: boolean;
  showBookmark: boolean;
  showHistory: boolean;
}

export const DEFAULT_PLAYER_PREFS: PlayerPrefs = {
  seekBackSeconds: MUSIC_DEFAULT_SEEK_STEP,
  seekForwardSeconds: MUSIC_DEFAULT_SEEK_STEP,
  showSeek: false,
  showBookmark: false,
  showHistory: false,
};

export const PLAYER_PREFS_KEY = "vedamatch:music-player-prefs";

const step = (value: unknown, fallback: number): number =>
  isMusicSeekStep(value) ? value : fallback;

const flag = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

/** Настройки с сервера → плеер. Недостающее и мусор — умолчания. */
export function prefsFromSettings(
  dto: Partial<MusicSettingsDto> | null | undefined,
): PlayerPrefs {
  const d = DEFAULT_PLAYER_PREFS;
  return {
    seekBackSeconds: step(dto?.seekBackSeconds, d.seekBackSeconds),
    seekForwardSeconds: step(dto?.seekForwardSeconds, d.seekForwardSeconds),
    showSeek: flag(dto?.playerShowSeek, d.showSeek),
    showBookmark: flag(dto?.playerShowBookmark, d.showBookmark),
    showHistory: flag(dto?.playerShowHistory, d.showHistory),
  };
}

/** Изменение в плеере → тело `PUT music/settings`, только присланное. */
export function prefsToSettingsPatch(
  patch: Partial<PlayerPrefs>,
): UpdateMusicSettingsRequest {
  const body: UpdateMusicSettingsRequest = {};
  if (patch.seekBackSeconds !== undefined) body.seekBackSeconds = patch.seekBackSeconds;
  if (patch.seekForwardSeconds !== undefined)
    body.seekForwardSeconds = patch.seekForwardSeconds;
  if (patch.showSeek !== undefined) body.playerShowSeek = patch.showSeek;
  if (patch.showBookmark !== undefined) body.playerShowBookmark = patch.showBookmark;
  if (patch.showHistory !== undefined) body.playerShowHistory = patch.showHistory;
  return body;
}

/** Копия из `localStorage`. Битая или чужая — умолчания, а не исключение. */
export function parseStoredPrefs(raw: string | null | undefined): PlayerPrefs | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown> | null;
    if (!value || typeof value !== "object") return null;
    const d = DEFAULT_PLAYER_PREFS;
    return {
      seekBackSeconds: step(value.seekBackSeconds, d.seekBackSeconds),
      seekForwardSeconds: step(value.seekForwardSeconds, d.seekForwardSeconds),
      showSeek: flag(value.showSeek, d.showSeek),
      showBookmark: flag(value.showBookmark, d.showBookmark),
      showHistory: flag(value.showHistory, d.showHistory),
    };
  } catch {
    return null;
  }
}

export function serializePrefs(prefs: PlayerPrefs): string {
  return JSON.stringify(prefs);
}

/** «15 секунд», «1 минута»: подпись шага словами. */
export function seekStepWords(seconds: number): string {
  if (seconds > 0 && seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} ${plural(minutes, "минуту", "минуты", "минут")}`;
  }
  return `${seconds} ${plural(seconds, "секунду", "секунды", "секунд")}`;
}

/** Имя кнопки перемотки: «Назад на 15 секунд», «Вперёд на 1 минуту». */
export function seekButtonLabel(direction: -1 | 1, seconds: number): string {
  return `${direction < 0 ? "Назад" : "Вперёд"} на ${seekStepWords(seconds)}`;
}

/**
 * Где нужна строка вынесенных кнопок под полосой.
 *
 * - `none` — ничего не вынесено, полоса как была.
 * - `narrow` — строка только уже `lg`: вынесена одна перемотка, а на
 *   широком экране её кнопки и так стоят в ряду управления.
 * - `all` — строка на любой ширине: «Метке» и «Истории» в однострочной
 *   полосе места нет (1000 точек заняты до последней), и втиснутые туда
 *   кнопки наезжали на чип скорости.
 */
export type PinnedLayout = "none" | "narrow" | "all";

export function pinnedLayout(prefs: PlayerPrefs): PinnedLayout {
  if (prefs.showBookmark || prefs.showHistory) return "all";
  if (prefs.showSeek) return "narrow";
  return "none";
}

/**
 * Эквалайзер во втором ряду полосы на телефоне (VED-450): свободное место
 * между управлением и кнопками полосы занимает он, пока его не заняли
 * вынесенные кнопки.
 *
 * - `large` — ничего не вынесено: ряд пустой, эквалайзер во весь рост;
 * - `small` — одна-две кнопки: эквалайзер меньше, но остаётся;
 * - `none` — вынесено всё или почти всё (три-четыре кнопки): места нет.
 *
 * Перемотка — две кнопки (назад и вперёд), метка и история — по одной.
 */
export type PinnedEqualizer = "large" | "small" | "none";

export function pinnedButtonCount(prefs: PlayerPrefs): number {
  return (
    (prefs.showSeek ? 2 : 0) +
    (prefs.showBookmark ? 1 : 0) +
    (prefs.showHistory ? 1 : 0)
  );
}

export function pinnedEqualizer(prefs: PlayerPrefs): PinnedEqualizer {
  const count = pinnedButtonCount(prefs);
  if (count === 0) return "large";
  if (count <= 2) return "small";
  return "none";
}
