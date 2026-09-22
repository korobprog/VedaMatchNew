import type { ChatGroupCallDto } from '@vedamatch/shared';
import type { GroupCallPhase } from './group-call-state';

/**
 * Что происходит с видео в групповой комнате (VED-293, этап 4): шлём ли мы
 * свою картинку, что показывать в каждой плитке и можно ли вообще нажать
 * «камеру».
 *
 * Родня `video-track-state.ts` звонка один на один (VED-291, #436): правило
 * «в фоне камера гаснет» здесь то же самое и по той же причине. Отдельный
 * модуль, а не общий с ним, потому что словарь другой — там фазы дозвона
 * (`outgoing`/`incoming`/`connecting`) и один собеседник, здесь комната без
 * дозвона и до трёх собеседников сразу. Сведение их в одну функцию
 * потребовало бы параметра «а какой у нас вид звонка», то есть ровно той
 * путаницы, ради избежания которой групповой звонок и живёт отдельно.
 * Совпадающая часть — предикат фона — вынесена в `videoDimmedByBackground`,
 * и при слиянии с #436 её видно одним грепом.
 */

export interface GroupVideoSendInput {
  phase: GroupCallPhase;
  /** Кнопка «камера»: человек хочет её включённой. */
  cameraOn: boolean;
  /** `AppState` приложения. */
  appState: 'active' | 'background' | 'inactive';
  /** Открыто окно «картинка в картинке». */
  pipActive: boolean;
}

/**
 * Приложение свернули — камеру гасим (кроме «картинки в картинке»).
 *
 * Кодирование видео — самая дорогая часть звонка по батарее и нагреву, а в
 * mesh'е оно ещё и умножается на число собеседников: втроём свёрнутое
 * приложение продолжало бы греть телефон двумя кодерами впустую. На Android
 * камеру в фоне вдобавок отбирает система, и кадры перестают идти молча —
 * собеседники видели бы замёрзшую картинку вместо честной заглушки.
 *
 * `'inactive'` (шторка уведомлений, переключатель приложений) камеру не
 * гасит: это доли секунды, а моргать картинкой у троих из-за свайпа по
 * шторке — хуже, чем чуть дольше покодировать.
 */
export function videoDimmedByBackground(
  appState: 'active' | 'background' | 'inactive',
  pipActive: boolean,
): boolean {
  return appState === 'background' && !pipActive;
}

/** Уходит ли наша картинка прямо сейчас. */
export function shouldSendGroupVideo({
  phase,
  cameraOn,
  appState,
  pipActive,
}: GroupVideoSendInput): boolean {
  if (phase !== 'active') return false;
  if (!cameraOn) return false;
  return !videoDimmedByBackground(appState, pipActive);
}

/** Что в плитке участника. */
export type TileView =
  /** Живая картинка. */
  | 'video'
  /** Аватар с именем: камера выключена или ещё не доехала. */
  | 'avatar';

export interface Tile {
  userId: string;
  view: TileView;
  isSelf: boolean;
}

export interface TilesInput {
  call: Pick<ChatGroupCallDto, 'participants'> | null;
  selfId: string;
  /** Реально ли уходит НАША картинка (`shouldSendGroupVideo`). */
  sendingVideo: boolean;
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
  remoteStreams,
  remoteVideoOff,
}: TilesInput): Tile[] {
  return (call?.participants ?? []).map((participant) => {
    const isSelf = participant.user.id === selfId;
    if (isSelf)
      return { userId: selfId, isSelf, view: sendingVideo ? 'video' : 'avatar' };
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
        ? 'video'
        : 'avatar';
    return { userId: participant.user.id, isSelf, view };
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
  if (!call || call.status !== 'live')
    return {
      willEnable: true,
      blocked: true,
      blockedReason: 'Звонок уже закончился',
    };

  const used = call.participants.filter(
    (p) => p.video && p.user.id !== selfId,
  ).length;
  if (used >= call.maxVideoParticipants)
    return {
      willEnable: true,
      blocked: true,
      blockedReason: 'В групповом видео могут участвовать трое',
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
