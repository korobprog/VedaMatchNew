/**
 * Доступ к камере словами (VED-335).
 *
 * Разрешение спрашивается не системным диалогом с порога: человек, которому
 * приложение молча показало «разрешить камеру?», отказывает чаще, а второй раз
 * Android уже не спросит. Поэтому сначала экран объясняет, зачем камера, и
 * только по нажатию кнопки уходит системный запрос.
 *
 * Отказ — не тупик. Штрихкод можно ввести руками: стёртый или смятый код
 * камера всё равно не прочитает, и ручной ввод нужен даже с разрешением.
 *
 * Модуль чистый: `expo-camera` сюда не импортируется, на вход приходит уже
 * полученный ответ. Иначе проверить разбор отказа без телефона было бы нечем.
 */

/** Ровно то, что отдаёт `useCameraPermissions()` из `expo-camera`. */
export interface CameraPermissionSnapshot {
  granted: boolean;
  /** `false` — система больше не покажет диалог, путь только в настройки. */
  canAskAgain: boolean;
}

export type CameraAccess =
  /** Ещё не спрашивали или спросим снова: показываем объяснение и кнопку. */
  | 'ask'
  /** Отказано насовсем: системный диалог больше не придёт. */
  | 'blocked'
  | 'granted';

export function cameraAccess(
  snapshot: CameraPermissionSnapshot | null | undefined,
): CameraAccess {
  // Ответа ещё нет (хук не успел) — это «спросим», а не «запрещено»:
  // показать отказ до первого вопроса значит обвинить человека зря.
  if (!snapshot) return 'ask';
  if (snapshot.granted) return 'granted';
  return snapshot.canAskAgain ? 'ask' : 'blocked';
}

export interface CameraAccessCopy {
  title: string;
  /** Зачем камера. Без этого объяснения разрешение просить нельзя. */
  body: string;
  /** Подпись главной кнопки. `null` — кнопки нет, остаётся запасной путь. */
  action: string | null;
  /** Запасной путь всегда назван: отказ не должен быть тупиком. */
  fallback: string;
}

const COPY: Record<Exclude<CameraAccess, 'granted'>, CameraAccessCopy> = {
  ask: {
    title: 'Нужна камера',
    body: 'Камера читает штрихкод с упаковки — прямо на телефоне, снимок никуда не отправляется. На сервер уходит только сам код, чтобы найти состав.',
    action: 'Разрешить камеру',
    fallback: 'Не хотите включать камеру — введите цифры штрихкода вручную.',
  },
  blocked: {
    title: 'Камера отключена в настройках',
    body: 'Система больше не спросит про камеру из приложения. Включить её можно в настройках телефона, в разрешениях VedaMatch.',
    action: 'Открыть настройки',
    fallback: 'Или просто введите цифры штрихкода вручную — сканер не нужен.',
  },
};

export function describeCameraAccess(
  access: CameraAccess,
): CameraAccessCopy | null {
  return access === 'granted' ? null : COPY[access];
}

/**
 * Куда ведёт кнопка на экране объяснения. Разведено с `describeCameraAccess`,
 * потому что это уже не текст, а поведение: у «ask» — системный диалог, у
 * «blocked» — настройки приложения.
 */
export type CameraAction = 'request' | 'settings' | 'none';

export function cameraAction(access: CameraAccess): CameraAction {
  if (access === 'granted') return 'none';
  return access === 'ask' ? 'request' : 'settings';
}
