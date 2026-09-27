"use client";

import type { ChatGroupCallDto } from "@vedamatch/shared";
import type { GroupCallPhase } from "./group-call-state";

/**
 * Что происходит с видео в групповой комнате (VED-293, этап 4): шлём ли мы
 * свою картинку, что показывать в каждой плитке и можно ли вообще нажать
 * «камеру».
 *
 * Порт одноимённого модуля приложения: правила «когда показывать картинку»
 * и «когда кнопка камеры недоступна» обязаны совпадать на телефоне и на
 * сайте, иначе у четвёртого участника кнопка будет гаснуть по-разному.
 * Обе спеки — копии друг друга, и расхождение покраснеет в одной из них.
 *
 * Отличие от приложения одно, и оно про окружение: «фон» здесь — скрытая
 * вкладка (`document.visibilityState`), а не свёрнутое приложение, и
 * «картинки в картинке» у панели комнаты нет. Поэтому вместо `appState` и
 * `pipActive` сюда приходит один `hidden`.
 */

export interface GroupVideoSendInput {
  phase: GroupCallPhase;
  /** Кнопка «камера»: человек хочет её включённой. */
  cameraOn: boolean;
  /** Вкладка скрыта (`document.visibilityState === "hidden"`). */
  hidden: boolean;
}

/**
 * Вкладку увели — камеру гасим.
 *
 * Кодирование видео дороже всего остального в звонке, а в mesh'е оно ещё и
 * умножается на число собеседников: втроём скрытая вкладка продолжала бы
 * гонять два кодера впустую — на ноутбуке это вентилятор и батарея, на
 * телефоне в браузере то же, что и в приложении. Смотреть свою камеру в
 * скрытой вкладке при этом некому.
 *
 * Скрытая вкладка — это именно `visibilityState`, а не потеря фокуса: окно
 * рядом с другим окном видно, и гасить в нём камеру было бы странно.
 * Свёрнутая панель комнаты (`setExpanded(false)`) тоже не считается —
 * человек остаётся на портале и его по-прежнему показывают остальным.
 */
export function videoDimmedByBackground(hidden: boolean): boolean {
  return hidden;
}

/** Уходит ли наша картинка прямо сейчас. */
export function shouldSendGroupVideo({
  phase,
  cameraOn,
  hidden,
}: GroupVideoSendInput): boolean {
  if (phase !== "active") return false;
  if (!cameraOn) return false;
  return !videoDimmedByBackground(hidden);
}

/**
 * Что уходит в наш видео-отправитель (VED-360): экран, камера или ничего.
 *
 * Экран и камера делят ОДИН отправитель — показ подменяет камеру через
 * `replaceTrack`, без новой видеосекции и пересогласования. Поэтому ответ
 * один, а не два флага: одновременно уйти они не могут физически.
 *
 * Экран сильнее камеры: нажавший «показать экран» хочет, чтобы видели
 * экран, а камера вернётся сама, когда показ кончится.
 *
 * Скрытая вкладка гасит камеру, но НЕ экран: показывают обычно другое окно
 * или вкладку, и собственная вкладка портала при этом как раз скрыта.
 * Погасить показ ровно тогда, когда человек перешёл к тому, что хотел
 * показать, — значит сломать показ целиком.
 */
export function outgoingVideo({
  phase,
  cameraOn,
  screenOn,
  hidden,
}: GroupVideoSendInput & { screenOn: boolean }): "screen" | "camera" | null {
  if (phase !== "active") return null;
  if (screenOn) return "screen";
  return shouldSendGroupVideo({ phase, cameraOn, hidden }) ? "camera" : null;
}

/** Что в плитке участника. */
export type TileView =
  /** Живая картинка. */
  | "video"
  /** Аватар с именем: камера выключена или ещё не доехала. */
  | "avatar";

export interface Tile {
  userId: string;
  view: TileView;
  isSelf: boolean;
  /**
   * В плитке экран, а не лицо (VED-360): показывать целиком (`contain`),
   * крупно и без зеркала — зеркальный текст не прочитать.
   */
  screen: boolean;
}

export interface TilesInput {
  call: Pick<ChatGroupCallDto, 'participants'> | null;
  selfId: string;
  /** Реально ли уходит НАША картинка (`outgoingVideo` не `null`). */
  sendingVideo: boolean;
  /** Уходит НАШ экран, а не камера. Необязательно: по умолчанию — нет. */
  sharingScreen?: boolean;
  /** От кого пришёл поток с живой видеодорожкой. */
  remoteStreams: ReadonlySet<string>;
  /**
   * Кто сам сказал «моя камера сейчас не снимает» сигналом
   * `{kind:'media'}` (`media-state-signal.ts`, перенесён из VED-291).
   *
   * Зачем это ПОВЕРХ `participant.video` с сервера. Место под видео
   * выдаётся сервером и держится за человеком, пока он в звонке, — в том
   * числе пока его приложение свёрнуто. А камеру в фоне мы гасим
   * (`videoDimmedByBackground`), и остальные без этого сигнала видели бы
   * замёрзший последний кадр: WebRTC про остановку дорожки не сообщает.
   * Молчание трактуется как «камера снимает» — отсутствующий сигнал не
   * должен гасить живую картинку.
   */
  remoteVideoOff: ReadonlySet<string>;
}

/**
 * Плитки комнаты: по одной на КАЖДОГО участника, включая себя и тех, у кого
 * камера выключена.
 *
 * Показывать только камеры было бы дешевле, но тогда четвёртый (которому
 * места под видео не досталось) исчезал бы с экрана, хотя он в разговоре и
 * его слышно. Человек, которого не видно и нет в списке, для остальных
 * просто не существует — это и есть та цена, ради экономии которой здесь
 * ничего не экономится.
 *
 * Своя плитка — в общей сетке, а не окошком в углу, как у звонка один на
 * один. Там окошко оправдано: собеседник один и он на всю «сцену». Здесь
 * равных плиток две-четыре, и своя среди них — ровно то, что человек
 * ожидает увидеть; окошко поверх сетки закрывало бы кого-то из троих.
 *
 * Плитка без картинки — аватар, а не чёрный прямоугольник: чёрное поле
 * читается как поломка связи, и именно про него спрашивают «у меня всё
 * зависло?».
 */
export function videoTiles({
  call,
  selfId,
  sendingVideo,
  sharingScreen = false,
  remoteStreams,
  remoteVideoOff,
}: TilesInput): Tile[] {
  return (call?.participants ?? []).map((participant) => {
    const isSelf = participant.user.id === selfId;
    if (isSelf)
      return {
        userId: selfId,
        isSelf,
        view: sendingVideo ? "video" : "avatar",
        screen: sendingVideo && sharingScreen,
      };
    // Чужая плитка показывает картинку, только когда СОШЛИСЬ три условия:
    // сервер отдал ему место под видео, к нам доехал поток, и сам он не
    // сказал, что сейчас не снимает. Каждое закрывает свой случай:
    // без первого кнопка соседа опережала бы решение сервера; без второго
    // на месте картинки был бы чёрный прямоугольник, пока идёт соединение;
    // без третьего свёрнутое приложение соседа показывало бы замёрзший
    // кадр, потому что место за ним остаётся.
    const view: TileView =
      participant.video &&
      remoteStreams.has(participant.user.id) &&
      !remoteVideoOff.has(participant.user.id)
        ? "video"
        : "avatar";
    // Признак экрана — с сервера, как и место под видео: по потоку экран
    // от камеры не отличить.
    return {
      userId: participant.user.id,
      isSelf,
      view,
      screen: Boolean(participant.screen),
    };
  });
}

/** Состояние кнопки «камера». */
export interface CameraButtonState {
  /** Нажатие сейчас включит камеру. */
  willEnable: boolean;
  /** Кнопка недоступна: мест под видео нет, и это не наше место. */
  blocked: boolean;
  /** Что сказать, когда нажали на недоступную. `null` — доступна. */
  blockedReason: string | null;
}

/**
 * Можно ли включить камеру — ПОДСКАЗКА для кнопки.
 *
 * Настоящее решение принимает сервер (`POST /state` отвечает 409 с текстом),
 * и это не дублирование правила «на всякий случай»: между нажатием и
 * ответом место мог занять сосед, а состав комнаты кнопка знает с
 * задержкой события. Кнопка гасится заранее только чтобы не выглядеть
 * рабочей там, где заведомо откажут; отказ сервера показывается как есть.
 */
export function cameraButtonState(
  call: ChatGroupCallDto | null,
  selfId: string,
  cameraOn: boolean,
): CameraButtonState {
  if (cameraOn)
    // Выключить свою камеру можно всегда — на то она и своя.
    return { willEnable: false, blocked: false, blockedReason: null };
  if (!call || call.status !== "live")
    return {
      willEnable: true,
      blocked: true,
      blockedReason: "Звонок уже закончился",
    };

  const used = call.participants.filter(
    (p) => p.video && p.user.id !== selfId,
  ).length;
  if (used >= call.maxVideoParticipants)
    return {
      willEnable: true,
      blocked: true,
      blockedReason: "В групповом видео могут участвовать трое",
    };
  return { willEnable: true, blocked: false, blockedReason: null };
}

/**
 * Сколько камер включено в комнате — для подписи и для пересчёта сетки.
 * Считается по данным сервера, а не по пришедшим потокам: потоки доезжают
 * с задержкой, а число мест должно сходиться у всех одинаково.
 */
export function camerasOn(call: ChatGroupCallDto | null): number {
  return (call?.participants ?? []).filter((p) => p.video).length;
}
