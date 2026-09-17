/**
 * Отказ в доступе к микрофону/камере и прочие ошибки медиа — словами.
 * Вынесено из `call-provider.tsx` веха 5 (веб-звонки): текст про «в
 * настройках телефона» верен только для Android — на вебе открыть системные
 * настройки из JS нечем (`Linking.openSettings` в `react-native-web` не
 * реализован вовсе, см. `app/call/[id].tsx`), человеку нужно другое
 * объяснение — разрешить доступ в самом браузере и обновить страницу.
 *
 * `PERMISSION_DENIED_PREFIX` — общий для обеих формулировок кусок текста,
 * по нему `isPermissionDeniedMessage` отличает «отказали в разрешении» от
 * прочих причин конца звонка (не нашли устройство, оно занято, сеть) — эта
 * проверка решает, показывать ли кнопку «Открыть настройки»/«Обновить
 * страницу» на экране звонка (`app/call/[id].tsx`).
 */
const PERMISSION_DENIED_PREFIX = 'Нет доступа к микрофону или камере';

export function describeMediaError(error: unknown, platformOS: string): string {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return platformOS === 'web'
      ? `${PERMISSION_DENIED_PREFIX} — разрешите его в браузере и обновите страницу`
      : `${PERMISSION_DENIED_PREFIX} — разрешите его в настройках телефона`;
  }
  if (name === 'NotFoundError') return 'Микрофон или камера не найдены';
  if (name === 'NotReadableError') return 'Микрофон или камера заняты другим приложением';
  if (error instanceof Error && error.message) return error.message;
  return 'Не удалось начать звонок';
}

/** Экран звонка решает по этому, а не по хрупкому совпадению всего текста
 *  (раньше — `.includes('настройках')`, что было верно только для одной из
 *  двух формулировок ниже). */
export function isPermissionDeniedMessage(message: string | null | undefined): boolean {
  return typeof message === 'string' && message.startsWith(PERMISSION_DENIED_PREFIX);
}
