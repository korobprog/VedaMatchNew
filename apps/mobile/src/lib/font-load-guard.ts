/**
 * Защита от вечного белого экрана (регрессия на Samsung A51, beef9235):
 * `_layout.tsx` держал `return null` пока `useFonts` не отдаст `loaded`
 * или `error` — если промис `useFonts` завис (не резолвится и не
 * реджектится, встречается на части устройств при памяти под давлением —
 * бандл после beef9235 стал заметно больше, 2279 модулей против прежних),
 * приложение зависало на пустом экране НАВСЕГДА: ни краша, ни лога, ни
 * рендера. Текст системным шрифтом лучше белого экрана.
 */
export const FONT_LOAD_TIMEOUT_MS = 3000;

/** Чистое условие гейта `_layout.tsx`: ждать дальше или уже рендерить приложение. */
export function shouldWaitForFonts(loaded: boolean, hasError: boolean, timedOut: boolean): boolean {
  return !loaded && !hasError && !timedOut;
}
