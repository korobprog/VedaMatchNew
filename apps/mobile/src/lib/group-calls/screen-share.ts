import type { ChatGroupCallDto } from '@vedamatch/shared';
import { screenSharer } from './group-video-state';

/**
 * Показ экрана с телефона в групповом звонке (VED-360) — чистая часть.
 *
 * Правила те же, что на сайте (`apps/web/.../group/screen-share.ts`), и
 * спеки — копии друг друга: экран подменяет камеру в том же отправителе
 * (`replaceTrack`), место под видео у него то же, признак «это экран» —
 * поле `screen` участника, в комнате показывает один, решает сервер.
 *
 * Отличаются окружение и ошибки: захват даёт `MediaProjection` Android'а
 * через `mediaDevices.getDisplayMedia()` react-native-webrtc, с системным
 * окном согласия и foreground-службой типа `mediaProjection` (заплатка
 * `patches/react-native-webrtc@124.0.8.patch`).
 */

export interface ScreenShareSupportInput {
  /** `Platform.OS`. */
  os: string;
  /** `Platform.Version` — на Android это уровень API числом. */
  version: number | string;
}

/**
 * Минимальный Android для показа — 10 (API 29). Ниже `MediaProjection`
 * тоже есть, но живую проверку показ проходил на 10–15, а кнопка, которая
 * на непроверенной системе роняет звонок, хуже отсутствующей.
 */
export const MIN_SCREEN_SHARE_ANDROID_API = 29;

/**
 * Есть ли кнопка «Показать экран». Только нативный Android: веб-сборка
 * приложения (iPhone через браузер) `getDisplayMedia` не умеет — как и
 * мобильный Safari на сайте.
 */
export function canShareScreen({ os, version }: ScreenShareSupportInput): boolean {
  if (os !== 'android') return false;
  const api = typeof version === 'number' ? version : Number.parseInt(version, 10);
  return Number.isFinite(api) && api >= MIN_SCREEN_SHARE_ANDROID_API;
}

export interface ScreenButtonState {
  /** Кнопку вообще показывать (телефон умеет показ). */
  visible: boolean;
  /** Нажатие начнёт показ (иначе — остановит). */
  willStart: boolean;
  /** Нажать можно, но откажут — кнопка гаснет и объясняет почему. */
  blocked: boolean;
  blockedReason: string | null;
}

/**
 * Можно ли начать показ — ПОДСКАЗКА для кнопки, как `cameraButtonState`:
 * настоящее решение принимает сервер (`POST /state` отвечает 409).
 * Остановить свой показ можно всегда.
 */
export function screenButtonState(
  call: ChatGroupCallDto | null,
  selfId: string,
  { sharing, supported }: { sharing: boolean; supported: boolean },
): ScreenButtonState {
  if (!supported)
    return { visible: false, willStart: true, blocked: true, blockedReason: null };
  if (sharing)
    return { visible: true, willStart: false, blocked: false, blockedReason: null };
  if (!call || call.status !== 'live')
    return {
      visible: true,
      willStart: true,
      blocked: true,
      blockedReason: 'Звонок уже закончился',
    };

  const holder = screenSharer(call);
  if (holder && holder.id !== selfId)
    return {
      visible: true,
      willStart: true,
      blocked: true,
      blockedReason: `Экран показывает ${holder.name}`,
    };

  const self = call.participants.find((p) => p.user.id === selfId);
  const usedByOthers = call.participants.filter(
    (p) => p.video && p.user.id !== selfId,
  ).length;
  if (!self?.video && usedByOthers >= call.maxVideoParticipants)
    return {
      visible: true,
      willStart: true,
      blocked: true,
      blockedReason: 'Все места под видео заняты — экран занимает место камеры',
    };
  return { visible: true, willStart: true, blocked: false, blockedReason: null };
}

/**
 * Что сказать серверу, когда показ кончился: снять признак и вернуть
 * камеру, если она была включена, иначе отдать место. Одним запросом.
 */
export function screenStopPatch(cameraOn: boolean): { screen: false; video: boolean } {
  return { screen: false, video: cameraOn };
}

/**
 * Нужен ли серверу запрос, когда во время показа нажали «камеру». Нет:
 * место держит экран, камера вернётся с концом показа (`screenStopPatch`),
 * а `{video:false}` посреди показа погасил бы и сам показ.
 */
export function cameraToggleNeedsServer(sharing: boolean): boolean {
  return !sharing;
}

/**
 * Сервер считает, что мы показываем, а мы уже нет — конец показа не дошёл.
 * `pending` — идёт запрос начала показа, состав этого окна не в счёт.
 */
export function screenFlagStale(
  call: Pick<ChatGroupCallDto, 'participants'> | null,
  selfId: string,
  { sharing, pending }: { sharing: boolean; pending: boolean },
): boolean {
  if (sharing || pending) return false;
  return Boolean(call?.participants.find((p) => p.user.id === selfId)?.screen);
}

/**
 * Почему показ не начался — словами, или `null`, если говорить нечего.
 *
 * react-native-webrtc отвергает `getDisplayMedia` строкой в `message`, а
 * не в `name`: «Отмена» в системном окне — `NotAllowedError`, не
 * запустившаяся служба — `AbortError`. «Отмена» — это «передумал», а не
 * ошибка, и ругаться в ответ на неё нельзя. Текст отказа СЕРВЕРА
 * показывается как есть.
 */
export function describeScreenShareError(
  error: unknown,
  isServerError: (error: unknown) => error is Error,
): string | null {
  if (isServerError(error)) return error.message;
  const e = (error ?? {}) as { name?: unknown; message?: unknown };
  const kind = [e.name, e.message].find(
    (value) =>
      value === 'NotAllowedError' || value === 'AbortError' || value === 'SecurityError',
  );
  if (kind === 'NotAllowedError') return null;
  if (kind === 'AbortError')
    return 'Телефон не дал начать показ экрана — попробуйте ещё раз';
  if (kind === 'SecurityError')
    return 'Телефон запретил показ экрана этому приложению';
  return 'Не удалось показать экран';
}

/**
 * Какую часть стороны экрана захватывать. Экран телефона — 1080×2400 и
 * больше, а кодировать его приходится отдельно для каждого собеседника:
 * на опорном A51 полный кадр втроём греет телефон не хуже камеры. Три
 * четверти стороны мелкий текст телефона ещё держат (его и так рисуют
 * крупно), а площадь кадра падает почти вдвое.
 *
 * Задаётся один раз на захват: react-native-webrtc меняет размер только
 * при повороте экрана. Состав меняет не размер, а битрейт и частоту
 * (`groupScreenEncoding`).
 */
export const SCREEN_CAPTURE_SCALE = 0.75;
