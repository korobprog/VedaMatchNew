/**
 * Форматирование полей манифеста для карточки «Проверить обновление»
 * (VED-176). Дублирует `apps/web/src/lib/app-download.ts` (то же правило
 * дублирования между `apps/web`/`apps/mobile`, что и в `manifest-validation.ts`).
 */

/** «42,3 МБ» — один знак после запятой, русский разделитель дробной части. */
export function formatApkSizeMb(sizeBytes: number): string {
  const megabytes = sizeBytes / (1024 * 1024);
  return `${megabytes.toFixed(1).replace('.', ',')} МБ`;
}

/** «17 сентября 2026 г.» — дата сборки в карточке, без времени: оно не нужно человеку. */
export function formatBuildDate(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/**
 * Целый процент 0..100 для прогресса закачки и проверки файла. Неизвестный
 * или нулевой объём — 0 (а не NaN/Infinity в `accessibilityValue`), перебор
 * (сервер прислал больше заявленного) обрезается до 100.
 */
export function percentOf(done: number, total: number): number {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0 || done <= 0) return 0;
  return Math.min(100, Math.floor((done / total) * 100));
}
