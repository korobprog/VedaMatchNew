/**
 * «Кто сейчас говорит» — из уровня звука, с гистерезисом.
 *
 * Уровень берётся из `getStats()` WebRTC (`audioLevel` у `inbound-rtp`
 * каждого собеседника и `media-source` у своего микрофона) — это число от 0
 * до 1, которое дёргается на каждом опросе. Показывать «говорит» прямо по
 * нему нельзя: подпись будет мигать на каждом вдохе и на каждом щелчке.
 *
 * Поэтому два порога и удержание:
 * - начать считать говорящим — выше `START_LEVEL`;
 * - перестать — только когда уровень ниже `STOP_LEVEL` дольше `HOLD_MS`.
 *
 * Чистый модуль: опрос статистики живёт в провайдере, а решение — здесь,
 * потому что именно его надо проверять таблицей случаев, а не на слух.
 */

/** Выше этого — человек заговорил. Подобрано по уровню обычной речи в
 *  `audioLevel` WebRTC: дыхание и шум комнаты держатся ниже. */
export const SPEAKING_START_LEVEL = 0.05;
/** Ниже этого — замолчал (с запасом, чтобы пауза в слове не гасила). */
export const SPEAKING_STOP_LEVEL = 0.02;
/** Сколько держим подпись после того, как человек замолчал. */
export const SPEAKING_HOLD_MS = 600;

export interface SpeakingEntry {
  speaking: boolean;
  /** ms, когда уровень последний раз был выше `SPEAKING_STOP_LEVEL`. */
  lastLoudAt: number;
}

export type SpeakingState = Record<string, SpeakingEntry>;

export const EMPTY_SPEAKING_STATE: SpeakingState = {};

/**
 * Новый замер уровней. `levels` — userId → уровень 0..1; отсутствующий в
 * замере участник считается молчащим (соединение ещё не встало или он
 * вышел), но не исчезает мгновенно — его гасит то же удержание.
 *
 * Выключенный микрофон обрабатывается отдельно от уровня (`muted`):
 * дорожка с `enabled = false` шлёт тишину, но остаточный уровень может
 * прийти в том же замере, и «говорит» под перечёркнутым микрофоном — это
 * прямая ложь интерфейса.
 */
export function nextSpeakingState(
  state: SpeakingState,
  levels: Readonly<Record<string, number>>,
  now: number,
  muted: ReadonlySet<string> = new Set(),
): SpeakingState {
  const next: SpeakingState = {};
  const ids = new Set([...Object.keys(state), ...Object.keys(levels)]);
  for (const userId of ids) {
    const level = levels[userId] ?? 0;
    const previous = state[userId] ?? { speaking: false, lastLoudAt: 0 };
    if (muted.has(userId)) {
      next[userId] = { speaking: false, lastLoudAt: previous.lastLoudAt };
      continue;
    }
    const loud = level > SPEAKING_STOP_LEVEL;
    const lastLoudAt = loud ? now : previous.lastLoudAt;
    const speaking = previous.speaking
      ? now - lastLoudAt < SPEAKING_HOLD_MS
      : level > SPEAKING_START_LEVEL;
    next[userId] = { speaking, lastLoudAt };
  }
  return next;
}

/** Говорящие сейчас, в стабильном порядке (по id) — чтобы список не прыгал. */
export function speakingIds(state: SpeakingState): string[] {
  return Object.entries(state)
    .filter(([, entry]) => entry.speaking)
    .map(([userId]) => userId)
    .sort();
}

/**
 * Разбор `RTCStatsReport` в уровни по собеседникам. Отдельной функцией от
 * самого опроса — по тому же приёму, что `isRelayed()` у звонка один на
 * один: браузерную статистику в jsdom не поднять, а разбор проверить надо.
 *
 * Отчёт приходит на КАЖДОЕ соединение отдельно, поэтому вызывающий говорит,
 * чей это отчёт, а функция ищет входящий звук. Для своего микрофона тот же
 * отчёт даёт `media-source` — его забирает `localAudioLevel`.
 */
export interface StatsEntry {
  type?: string;
  kind?: string;
  audioLevel?: number;
}

export function remoteAudioLevel(report: Iterable<StatsEntry>): number {
  let level = 0;
  for (const entry of report)
    if (entry?.type === "inbound-rtp" && entry.kind === "audio")
      level = Math.max(level, entry.audioLevel ?? 0);
  return level;
}

export function localAudioLevel(report: Iterable<StatsEntry>): number {
  let level = 0;
  for (const entry of report)
    if (entry?.type === "media-source" && entry.kind === "audio")
      level = Math.max(level, entry.audioLevel ?? 0);
  return level;
}
