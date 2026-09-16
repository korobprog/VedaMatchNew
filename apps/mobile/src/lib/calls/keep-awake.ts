import type { ChatCallKind } from '@vedamatch/shared';

/**
 * «Экран не гаснет во время видео» (VED-222, п.4) — и только во время
 * видео, и только пока открыт экран звонка. `InCallManager.start()`
 * (`react-native-incall-manager`) сам держит `FLAG_KEEP_SCREEN_ON` включённым
 * при любом типе звонка (`startEvents()` в его нативном коде вызывает
 * `setKeepScreenOn(true)` безусловно) — эта функция решает, нужно ли явно
 * перекрыть это значение сразу после `start()` для аудиозвонка: не держать
 * экран principial, полагаясь на датчик приближения
 * (`react-native-incall-manager` сам гасит экран у уха только когда
 * маршрут — разговорный динамик, `keep-awake.spec.ts` документирует эту
 * асимметрию как решение, не как побочный эффект).
 */
export function shouldKeepScreenAwake(kind: ChatCallKind): boolean {
  return kind === 'video';
}
