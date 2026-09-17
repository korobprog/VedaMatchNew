import type { ChatCallKind } from '@vedamatch/shared';
import type { CallAudioRoute } from './audio-route';
import type { CallPhase } from './call-machine';

/**
 * Когда должна жить аудиосессия разговора (`InCallManager.start()`/`stop()`)
 * и когда — датчик приближения (`startProximitySensor()`/`stopProximitySensor()`)
 * (VED-222, п.2-4 — исправление `feedback-001.md`, блокирующий п.1).
 *
 * До этой правки `InCallManager.start()`/`stop()` вызывались в
 * `useEffect`/cleanup на `app/call/[id].tsx`, то есть буквально при
 * монтировании/размонтировании экрана — а экран умеет сворачиваться по
 * системному «назад» ВО ВРЕМЯ активного разговора, не завершая его
 * (`call-screen-return.ts`, `backMinimizesCall`, штатный путь ещё с этапа
 * 1/2). Итог: «назад» во время разговора снимал аудиофокус,
 * `MODE_IN_COMMUNICATION`, Bluetooth SCO/проводную гарнитуру и датчик
 * приближения — ровно то, что этап 3 обещает держать «весь свой срок»,
 * хотя сам разговор (служба переднего плана, self-managed `Connection`)
 * продолжал жить.
 *
 * Решение: аудиосессия целиком следует за ФАЗОЙ звонка (живёт в
 * `call-provider.tsx`, тем же паттерном, что уже применён для
 * `CallForegroundService`/`Connection`), не за видимостью экрана.
 * Датчик приближения — отдельное решение: он физически привязан к «человек
 * держит телефон у уха ради ЭТОГО разговора», а это осмысленно только пока
 * экран звонка виден (иначе обычная работа с другим разделом приложения —
 * поднёс телефон к лицу прочитать сообщение — гасила бы экран без всякой
 * связи со звонком).
 */

/** Аудиосессия должна быть поднята — от первого захвата медиа (`connecting`)
 *  до конца разговора (`active`); вне этого окна — снята. */
export function isAudioSessionLive(phase: CallPhase): boolean {
  return phase === 'connecting' || phase === 'active';
}

/**
 * Датчик приближения — только пока одновременно: аудиосессия жива,
 * звонок аудио (не видео — там показывают картинку, гасить экран у уха
 * бессмысленно), экран звонка сейчас виден человеку, и текущий маршрут —
 * разговорный динамик (не громкая связь, не Bluetooth/наушники — там ухо не
 * прижато к корпусу телефона). `route === null` (данных от библиотеки ещё
 * нет — событие `onAudioDeviceChanged` не пришло) трактуется как разговорный
 * динамик: тот же дефолт, которым `InCallManager.start({media: 'audio'})`
 * сам выбирает маршрут при старте сессии.
 */
export function shouldEnableProximity(
  phase: CallPhase,
  kind: ChatCallKind,
  screenVisible: boolean,
  route: CallAudioRoute | null,
): boolean {
  if (!isAudioSessionLive(phase)) return false;
  if (kind === 'video') return false;
  if (!screenVisible) return false;
  return route === null || route === 'EARPIECE';
}
