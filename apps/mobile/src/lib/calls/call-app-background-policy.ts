/**
 * Что делать с ещё не отвеченным входящим, когда приложение уходит в фон
 * (`AppState` → `'background'`, `call-provider.tsx`) — вынесено веха 5
 * (веб-звонки) отдельной чистой функцией, потому что раньше решение было
 * жёстко зашито как «Android — нативный путь, иначе — decline», а «иначе»
 * писалось в расчёте на нативный iOS (без self-managed `Connection`,
 * альтернативы decline действительно нет), которого в этом продукте не
 * существует (см. `PLAN.md`/спеку вехи 5: «iPhone без App Store» — это и
 * есть веб-сборка). На практике «иначе» всегда означает браузер, а свернуть
 * вкладку/переключиться в другую — обычное действие, не повод сбросить
 * ещё не отвеченный звонок молча под собеседником: баннер и рингтон на вебе
 * не привязаны к видимости вкладки (`ringtone.ts`, `Vibration` не требуют
 * переднего плана), звонок остаётся видимым, когда человек вернётся.
 */
export type BackgroundIncomingAction = 'native' | 'decline' | 'ignore';

export function decideBackgroundIncomingAction(platformOS: string): BackgroundIncomingAction {
  if (platformOS === 'android') return 'native';
  if (platformOS === 'web') return 'ignore';
  // Платформа без self-managed «Позвонить» и без браузерной вкладки —
  // сценарий, для которого исходно писался decline; сохранён как есть на
  // случай нативной сборки без Android-модуля.
  return 'decline';
}
