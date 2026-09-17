/**
 * Аудиомаршрутизация звонка (VED-222, п.2) — чистый разбор события
 * `onAudioDeviceChanged`, которое `react-native-incall-manager` шлёт через
 * `NativeEventEmitter(NativeModules.InCallManager)` (подписка — в
 * `audio-route-bridge.ts`, не тестируется: обёртка вокруг нативного модуля).
 *
 * Решение взять `react-native-incall-manager`, а не `CallEndpoint`/
 * `Connection.setAudioRoute` (API 34+) для аудиомаршрутизации self-managed
 * звонка — записано в `docs/mobile-calls-native.md` §12: библиотека уже
 * управляет и аудиофокусом (`AUDIOFOCUS_GAIN_TRANSIENT`,
 * `MODE_IN_COMMUNICATION`), и Bluetooth SCO (`AppRTCBluetoothManager`), и
 * проводной гарнитурой, и датчиком приближения на уровне `AudioManager` —
 * держать вторую, независимую систему маршрутизации через `Connection` той
 * же самой self-managed сессии означало бы, что обе конкурируют за один и
 * тот же аудиофокус/SCO-канал без единого источника правды. Она уже была
 * интегрирована в `app/call/[id].tsx` с этапа 1.
 */

/** Ровно значения `enum AudioDevice` в самой библиотеке (`InCallManagerModule.java`). */
export type CallAudioRoute = 'EARPIECE' | 'SPEAKER_PHONE' | 'BLUETOOTH' | 'WIRED_HEADSET';

const KNOWN_ROUTES: ReadonlySet<string> = new Set([
  'EARPIECE',
  'SPEAKER_PHONE',
  'BLUETOOTH',
  'WIRED_HEADSET',
]);

export interface AudioRouteState {
  available: CallAudioRoute[];
  selected: CallAudioRoute | null;
}

export const EMPTY_AUDIO_ROUTE_STATE: AudioRouteState = { available: [], selected: null };

export const AUDIO_ROUTE_LABELS: Record<CallAudioRoute, string> = {
  EARPIECE: 'Телефон',
  SPEAKER_PHONE: 'Громкая связь',
  BLUETOOTH: 'Bluetooth',
  WIRED_HEADSET: 'Наушники',
};

function isCallAudioRoute(value: unknown): value is CallAudioRoute {
  return typeof value === 'string' && KNOWN_ROUTES.has(value);
}

/**
 * `availableAudioDeviceList` — строка с JSON-массивом (нативная сторона
 * собирает её конкатенацией, не через `JSON`-сериализатор,
 * `InCallManagerModule.getAudioDeviceStatusMap`), `selectedAudioDevice` —
 * обычная строка, пустая при отсутствии выбора. Оба поля разбираются
 * защитно: испорченный/незнакомый payload даёт пустое состояние, а не падение.
 */
export function parseAudioRouteEvent(payload: {
  availableAudioDeviceList?: unknown;
  selectedAudioDevice?: unknown;
}): AudioRouteState {
  let available: CallAudioRoute[] = [];
  if (typeof payload.availableAudioDeviceList === 'string') {
    try {
      const parsed: unknown = JSON.parse(payload.availableAudioDeviceList);
      if (Array.isArray(parsed)) available = parsed.filter(isCallAudioRoute);
    } catch {
      available = [];
    }
  }
  const selected = isCallAudioRoute(payload.selectedAudioDevice) ? payload.selectedAudioDevice : null;
  return { available, selected };
}

/** Кнопка выбора устройства вывода нужна, только когда есть из чего реально
 *  выбирать (VED-222, п.2: «если доступно больше двух») — иначе это простой
 *  переключатель «громкая связь вкл/выкл», который уже был на экране с
 *  этапа 1. */
export function shouldShowRoutePicker(state: AudioRouteState): boolean {
  return state.available.length > 2;
}

/** Подпись текущего маршрута для кнопки/`accessibilityLabel` — пока нет ни
 *  одного события (сразу после `InCallManager.start()`), приходится
 *  угадывать по умолчанию звонка: видео — громкая связь, аудио — телефон
 *  (тот же выбор, что делает сама библиотека при `start()`). */
export function currentRouteLabel(state: AudioRouteState, fallbackSpeaker: boolean): string {
  if (state.selected) return AUDIO_ROUTE_LABELS[state.selected];
  return fallbackSpeaker ? AUDIO_ROUTE_LABELS.SPEAKER_PHONE : AUDIO_ROUTE_LABELS.EARPIECE;
}
