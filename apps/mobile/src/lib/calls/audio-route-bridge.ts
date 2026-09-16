import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import { parseAudioRouteEvent, type AudioRouteState, type CallAudioRoute } from './audio-route';

/**
 * Склейка вокруг `NativeEventEmitter(NativeModules.InCallManager)` —
 * `react-native-incall-manager`'s JS-обёртка (`index.js`) не переэкспортирует
 * подписку на `onAudioDeviceChanged`/`chooseAudioRoute` promise-результат как
 * событие, хотя нативная сторона его шлёт (см. `audio-route.ts`, шапка) —
 * подписываемся напрямую на нативный модуль, обычный приём для RN-библиотек
 * без готовой JS-обёртки под конкретное событие. Не тестируется: обёртка
 * вокруг нативного модуля, чистый разбор — в `audio-route.ts`.
 */

const SUPPORTED = Platform.OS === 'android' && Boolean(NativeModules.InCallManager);
const emitter = SUPPORTED ? new NativeEventEmitter(NativeModules.InCallManager) : null;

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
