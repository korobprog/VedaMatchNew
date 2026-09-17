import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import { parseAudioRouteEvent, type AudioRouteState, type CallAudioRoute } from './audio-route';

/**
 * Склейка вокруг `NativeEventEmitter` для `onAudioDeviceChanged` —
 * `react-native-incall-manager`'s JS-обёртка (`index.js`) не переэкспортирует
 * подписку на это событие, хотя нативная сторона его шлёт (см. `audio-route.ts`,
 * шапка) — подписываемся напрямую, обычный приём для RN-библиотек без
 * готовой JS-обёртки под конкретное событие. Не тестируется: обёртка вокруг
 * нативного модуля, чистый разбор — в `audio-route.ts`.
 *
 * Конструктор — БЕЗ аргумента (правка по факту живой проверки, Samsung
 * Galaxy A51: `W ReactNativeJS: 'new NativeEventEmitter()' was called with a
 * non-null argument without the required 'addListener'/'removeListeners'
 * method` — было `new NativeEventEmitter(NativeModules.InCallManager)`).
 * Нативный модуль `InCallManager` не реализует `addListener`/`removeListeners`
 * (шлёт событие напрямую через `RCTDeviceEventEmitter`, без своего счётчика
 * подписчиков) — по исходнику `NativeEventEmitter.js` сам React Native этого
 * и не требует нигде, кроме iOS (`invariant` там только под
 * `Platform.OS === 'ios'`), а без аргумента предупреждение не выводится
 * вовсе, при этом события всё равно доходят (тот же глобальный
 * `RCTDeviceEventEmitter` под капотом и с аргументом, и без).
 */

const SUPPORTED = Platform.OS === 'android' && Boolean(NativeModules.InCallManager);
const emitter = SUPPORTED ? new NativeEventEmitter() : null;

export function subscribeToAudioRouteChanges(onChange: (state: AudioRouteState) => void): () => void {
  if (!emitter) return () => undefined;
  const subscription = emitter.addListener('onAudioDeviceChanged', (payload: unknown) => {
    onChange(parseAudioRouteEvent((payload ?? {}) as Record<string, unknown>));
  });
  return () => subscription.remove();
}

export function chooseAudioRoute(route: CallAudioRoute): void {
  if (!SUPPORTED) return;
  void InCallManager.chooseAudioRoute(route);
}
