/**
 * Дорожка голосового: столько же точек, что на сайте (40,
 * `apps/web/src/components/chat/chat-voice-recorder.tsx`) — само число не
 * экспортируется оттуда (правило модуля запрещает импорт чужого сервиса, а
 * тут ещё и другое приложение), поэтому продублировано.
 */
export const WAVEFORM_POINTS = 40;

/** Ровная дорожка-заглушка для голосового без сохранённых уровней. */
export function flatWaveform(points: number = WAVEFORM_POINTS, level = 30): number[] {
  return Array.from({ length: points }, () => level);
}

/** Сжимает измерения до `points` столбиков — тот же приём, что на сайте. */
export function downsampleWaveform(levels: readonly number[], points: number = WAVEFORM_POINTS): number[] {
  if (levels.length === 0) return flatWaveform(points);
  if (levels.length <= points) return [...levels];
  const step = levels.length / points;
  return Array.from({ length: points }, (_, index) => {
    const from = Math.floor(index * step);
    const to = Math.max(Math.floor((index + 1) * step), from + 1);
    const slice = levels.slice(from, to);
    return Math.round(slice.reduce((sum, value) => sum + value, 0) / slice.length);
  });
}

/**
 * Уровень записи `expo-audio` (`metering`, дБ полной шкалы, обычно от -160
 * до 0) в шкалу 0..100 для столбика — тот же диапазон, что уже пишется в
 * `waveform` вложения. Тихая студия и шум эфира дают около -50…-60 дБ, речь
 * в комнате — от -30 до 0: порог отсечки ниже -50 дБ, чтобы фоновый шум не
 * рисовал дорожку вечно на минимальной высоте.
 */
const METERING_FLOOR_DB = -50;

export function normalizeMeteringLevel(db: number): number {
  if (!Number.isFinite(db)) return 0;
  const clamped = Math.max(METERING_FLOOR_DB, Math.min(0, db));
  return Math.round(((clamped - METERING_FLOOR_DB) / -METERING_FLOOR_DB) * 100);
}
