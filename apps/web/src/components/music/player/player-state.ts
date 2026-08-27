import type { MusicRepeatMode } from "@vedamatch/shared";

/**
 * Состояние плеера в `localStorage`.
 *
 * Зеркало нужно ради мгновенного старта: серверное состояние приезжает
 * запросом, а полоса внизу экрана должна показать, что играло, ещё до него.
 * Поэтому читается оно на первом же кадре — и поэтому же разбор вынесен в
 * чистый модуль под тестом.
 *
 * Хранилищу верить нельзя ровно так же, как клиенту на сервере: там переживёт
 * оборванная запись, чужое расширение и состояние от прошлой версии сборки.
 * Битое значение обязано означать «начинаем с нуля», а не белый экран.
 */

/** Растёт, когда поля меняют смысл. Читатель с другой версией начинает с нуля. */
export const PLAYER_STATE_VERSION = 1;

/** Границы скорости из плана: лекции ускоряют, киртаны — нет. */
export const PLAYER_RATE_MIN = 0.75;
export const PLAYER_RATE_MAX = 2;

export interface PersistedPlayerState {
  version: number;
  /** Идентификаторы записей: карточки страница дочитает сама. */
  queue: string[];
  index: number;
  positionSeconds: number;
  repeat: MusicRepeatMode;
  shuffle: boolean;
  /** Seed перестановки: очередь не должна перетасовываться при перезагрузке. */
  shuffleSeed: number;
  rate: number;
  volume: number;
}

const REPEATS: MusicRepeatMode[] = ["off", "all", "one"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function serializePlayerState(state: PersistedPlayerState): string {
  return JSON.stringify({ ...state, version: PLAYER_STATE_VERSION });
}

/**
 * `null` — доверять нечему: пусто, битое, чужой версии или без очереди.
 * Во всех четырёх случаях плеер начинает с чистого листа, и это правильнее
 * попытки собрать состояние из обломков.
 */
export function parsePlayerState(
  raw: string | null | undefined,
): PersistedPlayerState | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const value = parsed as Record<string, unknown>;

  // Чужая версия отбрасывается целиком: поля могли поменять смысл, и
  // применять их наугад хуже, чем начать с нуля.
  if (value.version !== PLAYER_STATE_VERSION) return null;

  const queue = Array.isArray(value.queue)
    ? value.queue.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      )
    : [];
  // Состояние без очереди бесполезно: играть нечего, а поля вокруг только
  // сбивают с толку.
  if (queue.length === 0) return null;

  const index = Math.floor(number(value.index, 0));
  const repeat = REPEATS.includes(value.repeat as MusicRepeatMode)
    ? (value.repeat as MusicRepeatMode)
    : "off";

  return {
    version: PLAYER_STATE_VERSION,
    queue,
    // Позиция за краем очереди — состояние от прежней очереди; возвращаем в
    // начало, а не молчим о нём.
    index: index >= 0 && index < queue.length ? index : 0,
    positionSeconds: Math.max(0, Math.floor(number(value.positionSeconds, 0))),
    repeat,
    shuffle: value.shuffle === true,
    shuffleSeed: Math.floor(number(value.shuffleSeed, 1)) || 1,
    rate: clamp(number(value.rate, 1), PLAYER_RATE_MIN, PLAYER_RATE_MAX),
    volume: clamp(number(value.volume, 1), 0, 1),
  };
}
