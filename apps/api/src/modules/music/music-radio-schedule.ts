import {
  MUSIC_RADIO_INSERT_MAX_BYTES,
  MUSIC_RADIO_INSERT_MAX_DAYS_AHEAD,
  MUSIC_RADIO_INSERT_MAX_SECONDS,
  MUSIC_RADIO_INSERT_MIME_TYPES,
  type MusicRadioInsertStatus,
} from '@vedamatch/shared';

/**
 * Расписание «Радио VM» (VED-437) — чистая часть: выбор следующей записи,
 * место вставки в эфире, окно «сейчас / дальше» и проверки файла вставки.
 * Базы здесь нет, поэтому всё под тестом (`music-radio-schedule.spec.ts`).
 */

export interface RadioSlotTiming {
  startsAt: Date;
  durationMs: number;
}

export const slotEndMs = (slot: RadioSlotTiming): number =>
  slot.startsAt.getTime() + slot.durationMs;

/**
 * Следующая запись эфира: случайная из тех, что ещё не звучали на этом
 * круге. Прозвучал весь каталог — начинается новый круг, и первой в нём не
 * может стать только что отзвучавшая запись: стык кругов не должен давать
 * повтор подряд.
 */
export function pickRadioTrack(
  pool: readonly string[],
  playedInCycle: ReadonlySet<string>,
  lastTrackId: string | null,
  cycle: number,
  random: () => number = Math.random,
): { trackId: string; cycle: number } | null {
  if (pool.length === 0) return null;
  let candidates = pool.filter((id) => !playedInCycle.has(id));
  let nextCycle = cycle;
  if (candidates.length === 0) {
    nextCycle = cycle + 1;
    candidates =
      pool.length > 1 ? pool.filter((id) => id !== lastTrackId) : [...pool];
  }
  const at = Math.min(
    candidates.length - 1,
    Math.max(0, Math.floor(random() * candidates.length)),
  );
  return { trackId: candidates[at], cycle: nextCycle };
}

export type PlannedRadioSlot =
  | { kind: 'insert'; insertId: string; durationMs: number }
  | { kind: 'track'; trackId: string; cycle: number; durationMs: number };

/**
 * Что ставить в эфир с момента `fromMs`. Вставка, чьё время пришло, идёт
 * первой; вставка, чьё время наступит посреди записи, обрывает запись
 * ровно в свою минуту. `null` — играть нечего.
 */
export function planRadioSlot(
  fromMs: number,
  insert: { id: string; atMs: number; durationMs: number } | null,
  track: { id: string; cycle: number; durationMs: number } | null,
): PlannedRadioSlot | null {
  if (insert && insert.atMs <= fromMs) {
    return {
      kind: 'insert',
      insertId: insert.id,
      durationMs: Math.max(1000, insert.durationMs),
    };
  }
  if (!track) return null;
  const full = Math.max(1000, track.durationMs);
  const durationMs =
    insert && insert.atMs < fromMs + full ? insert.atMs - fromMs : full;
  return { kind: 'track', trackId: track.id, cycle: track.cycle, durationMs };
}

/** Что звучит в `nowMs` и что следом; слоты — по возрастанию начала. */
export function radioWindow<T extends RadioSlotTiming>(
  slots: readonly T[],
  nowMs: number,
): { current: T | null; next: T | null } {
  const at = slots.findIndex(
    (slot) => slot.startsAt.getTime() <= nowMs && slotEndMs(slot) > nowMs,
  );
  if (at < 0) {
    return {
      current: null,
      next: slots.find((slot) => slot.startsAt.getTime() > nowMs) ?? null,
    };
  }
  return { current: slots[at], next: slots[at + 1] ?? null };
}

/** Состояние вставки по её слоту в эфире. */
export function radioInsertStatus(
  slot: RadioSlotTiming | null,
  nowMs: number,
): MusicRadioInsertStatus {
  if (!slot || slot.startsAt.getTime() > nowMs) return 'scheduled';
  return slotEndMs(slot) > nowMs ? 'on_air' : 'aired';
}

/**
 * Когда выйти вставке в эфир. Пусто — сейчас. Прошедшее время — тоже
 * сейчас: пока редактор заполнял форму, назначенная минута могла пройти.
 */
export function resolveInsertTime(
  value: unknown,
  now: Date,
): { at: Date } | { error: string } {
  if (value === undefined || value === null || value === '') {
    return { at: now };
  }
  if (typeof value !== 'string') return { error: 'Неверное время выхода' };
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return { error: 'Неверное время выхода' };
  const limit =
    now.getTime() + MUSIC_RADIO_INSERT_MAX_DAYS_AHEAD * 24 * 3_600_000;
  if (at.getTime() > limit) {
    return {
      error: `Отложить можно не больше чем на ${MUSIC_RADIO_INSERT_MAX_DAYS_AHEAD} дней`,
    };
  }
  return { at: at.getTime() < now.getTime() ? now : at };
}

/** Тип файла вставки без параметров: `audio/webm;codecs=opus` → `audio/webm`. */
export function normalizeInsertMime(mime: string | undefined): string {
  const base = (mime ?? '').split(';')[0].trim().toLowerCase();
  if (base === 'audio/mp3') return 'audio/mpeg';
  if (base === 'audio/x-m4a' || base === 'audio/m4a') return 'audio/mp4';
  if (base === 'audio/x-wav' || base === 'audio/wave') return 'audio/wav';
  return base;
}

/** Проверка файла вставки; `null` — годится. */
export function validateRadioInsertFile(input: {
  mime: string;
  sizeBytes: number;
}): string | null {
  if (
    !(MUSIC_RADIO_INSERT_MIME_TYPES as readonly string[]).includes(input.mime)
  ) {
    return 'Нужен звук: MP3, M4A, OGG, WebM или WAV';
  }
  if (input.sizeBytes <= 0) return 'Файл пустой';
  if (input.sizeBytes > MUSIC_RADIO_INSERT_MAX_BYTES) {
    return `Файл больше ${Math.round(MUSIC_RADIO_INSERT_MAX_BYTES / 1024 / 1024)} МБ`;
  }
  return null;
}

/**
 * Длительность вставки: прочитанная сервером, а если файл её не называет
 * (запись с микрофона в WebM часто без неё) — измеренная браузером.
 * Округляется вверх: обрезать конец фразы хуже, чем секунда тишины.
 */
export function resolveInsertDuration(
  parsedSeconds: number | null | undefined,
  clientSeconds: unknown,
): number | string {
  const client =
    typeof clientSeconds === 'string' ? Number(clientSeconds) : clientSeconds;
  const seconds =
    typeof parsedSeconds === 'number' &&
    Number.isFinite(parsedSeconds) &&
    parsedSeconds > 0
      ? parsedSeconds
      : typeof client === 'number' && Number.isFinite(client) && client > 0
        ? client
        : null;
  if (seconds === null) return 'Не удалось определить длительность записи';
  if (seconds > MUSIC_RADIO_INSERT_MAX_SECONDS) {
    return `Вставка длиннее ${MUSIC_RADIO_INSERT_MAX_SECONDS / 60} минут`;
  }
  return Math.max(1, Math.ceil(seconds));
}

/** Расширение ключа в бакете по типу файла. */
export function insertExtension(mime: string): string {
  switch (mime) {
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/mp4':
      return 'm4a';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/wav':
      return 'wav';
    default:
      return 'webm';
  }
}
