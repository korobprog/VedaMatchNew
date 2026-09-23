import type { LookupPhase } from './aim-state';

/**
 * Когда камера сканера включена, а когда отпущена (VED-335, третий заход).
 *
 * Держать камеру включённой, когда она не нужна, — это нагрев телефона,
 * расход батареи и горящий индикатор камеры, который человеку неприятен и
 * без объяснений выглядит как слежка. Замечание пользователя было ровно про
 * это: после снимка состава камеру можно отпускать.
 *
 * КАК ИМЕННО ОТПУСКАЕМ. `CameraView` умеет `active`, но это свойство только
 * для iOS (`expo-camera/build/Camera.types.d.ts`, `@platform ios`). На
 * Android сессию освобождает размонтирование: в `ExpoCameraView.onDetached`
 * вызывается `cameraProvider.unbindAll()` — тот же вызов, что и в
 * `pausePreview()`. Поэтому экраны не рендерят `CameraView` вовсе, когда он
 * не нужен, а не прячут его прозрачностью: спрятанный `CameraView` остаётся
 * привязанным к жизненному циклу и продолжает держать камеру.
 *
 * Решение о включении — чистая функция: «камера включена» это состояние, а
 * не побочный эффект, и его надо проверять тестом, а не индикатором на
 * телефоне.
 */

export interface ScannerCameraInput {
  /** Экран сканера на виду. Уход на ответ и «назад» — это `false`. */
  focused: boolean;
  /** Приложение на переднем плане. Свернули или пришёл звонок — `false`. */
  appActive: boolean;
  /** Код уже прочитан и ушёл на разбор — ловить больше нечего. */
  lookup: LookupPhase;
}

export function scannerCameraOn({
  focused,
  appActive,
  lookup,
}: ScannerCameraInput): boolean {
  if (!focused || !appActive) return false;
  // Код прочитан — гасим сразу, не дожидаясь, пока отработает переход на
  // экран ответа: между нажатием и сменой экрана проходят сотни миллисекунд,
  // и всё это время камера жгла бы батарею впустую.
  return lookup === 'idle';
}

/** Что сейчас делает экран съёмки состава. */
export type LabelStage = 'aim' | 'reading' | 'answer';

export interface LabelCameraInput {
  focused: boolean;
  appActive: boolean;
  stage: LabelStage;
}

export function labelCameraOn({
  focused,
  appActive,
  stage,
}: LabelCameraInput): boolean {
  if (!focused || !appActive) return false;
  // Снимок сделан и ушёл в разбор — живой кадр не нужен: на экране остаётся
  // сам снимок и ход обработки. «Переснять» возвращает стадию `aim`, и
  // камера включается обратно.
  return stage === 'aim';
}

/**
 * Показывать ли застывший снимок вместо видоискателя. Разведено с
 * `labelCameraOn` намеренно: «камера выключена» и «есть что показать вместо
 * неё» — разные вопросы, и на стадии `aim` до первого снимка ответ на второй
 * отрицательный, хотя камера включена.
 */
export function showFrozenShot({
  stage,
  hasShot,
}: {
  stage: LabelStage;
  hasShot: boolean;
}): boolean {
  return stage !== 'aim' && hasShot;
}
