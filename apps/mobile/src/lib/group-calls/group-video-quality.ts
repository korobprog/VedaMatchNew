import { videoEncodingFor, type VideoEncoding } from '@/lib/calls/video-encoding';
import type { NetworkTransport } from '../../../modules/vedamatch-calls';

/**
 * Качество исходящего видео в ГРУППОВОЙ комнате (VED-293, этап 4).
 *
 * Надстройка над потолком звонка один на один (`video-encoding.ts`, VED-291),
 * а не второй расчёт: транспорт («сколько можно по этой сети») считает он,
 * здесь добавляется вторая ось — «на сколько собеседников телефон кодирует».
 *
 * Почему вторая ось вообще нужна. В mesh'е нет общего кодирования: у
 * каждого `RTCPeerConnection` свой кодер, и вдвоём телефон кодирует кадр
 * один раз, а втроём — дважды, вчетвером — трижды. Ровно за это
 * (аппаратный кодер H.264 плюс трафик вверх) A51 и платит нагревом. Значит
 * потолок 1,2 Мбит, безобидный вдвоём, вчетвером означает 3,6 Мбит вверх и
 * три параллельных кодирования — этого канал абонента не выдержит, а
 * телефон выдержит недолго.
 *
 * Поэтому с каждым новым собеседником падает и битрейт, и сторона кадра.
 * Сторону режем сильнее битрейта нарочно: при мелких плитках (втроём экран
 * телефона делится на три) лишние пиксели всё равно не видны, а кодеру
 * площадь кадра стоит дороже всего.
 *
 * Пересчитывается на каждое изменение состава — и на вход, и на выход:
 * человек, оставшийся вдвоём после того, как третий положил трубку, должен
 * получить картинку обратно, а не доживать разговор на 360p.
 */

/**
 * Во сколько раз ужимаем относительно потолка «один на один» при данном
 * размере комнаты. Ключ — число УЧАСТНИКОВ (не камер): кодировать
 * приходится для каждого соединения, даже если собеседник сидит с
 * выключенной камерой и только смотрит.
 */
interface QualityStep {
  /** Доля от битрейта «один на один». */
  bitrate: number;
  /** Во сколько раз дополнительно уменьшаем сторону кадра. */
  scale: number;
  /** Потолок частоты кадров, кадр/с. */
  framerate: number;
}

const STEPS: readonly QualityStep[] = [
  // Индекс = число участников. 0 и 1 — вырожденные (кодировать некому),
  // берём те же значения, что и для пары, чтобы функция была тотальной.
  { bitrate: 1, scale: 1, framerate: 30 },
  { bitrate: 1, scale: 1, framerate: 30 },
  /** Двое — ровно звонок один на один, ужимать нечего. */
  { bitrate: 1, scale: 1, framerate: 30 },
  /** Трое: два кодирования. Половина битрейта, сторона в полтора раза. */
  { bitrate: 0.5, scale: 1.5, framerate: 24 },
  /** Четверо: три кодирования. Треть битрейта, сторона вдвое, 20 кадров. */
  { bitrate: 1 / 3, scale: 2, framerate: 20 },
];

/** Ниже этого не опускаемся: 150 кбит — граница, за которой лицо превращается в кашу. */
export const MIN_GROUP_VIDEO_BITRATE = 150_000;

/**
 * Потолок исходящего видео при таком транспорте и таком составе.
 *
 * `participantCount` больше `STEPS.length` не бывает (потолок комнаты —
 * четверо), но функция обязана оставаться тотальной: правило «упали в самый
 * жёсткий шаг» безопаснее, чем `undefined` в параметрах кодера.
 */
export function groupVideoEncoding(
  transport: NetworkTransport | null,
  participantCount: number,
): VideoEncoding {
  const base = videoEncodingFor(transport);
  const step = STEPS[clampIndex(participantCount)];
  return {
    maxBitrate: Math.max(
      Math.round(base.maxBitrate * step.bitrate),
      MIN_GROUP_VIDEO_BITRATE,
    ),
    maxFramerate: Math.min(base.maxFramerate, step.framerate),
    scaleResolutionDownBy: base.scaleResolutionDownBy * step.scale,
  };
}

function clampIndex(participantCount: number): number {
  if (!Number.isFinite(participantCount) || participantCount < 0) return 0;
  return Math.min(Math.floor(participantCount), STEPS.length - 1);
}

/**
 * Изменилось ли качество при переходе от одного состава к другому — чтобы
 * провайдер не дёргал `setParameters` через нативный мост на каждое
 * событие комнаты (их приходит по одному на любой чих: микрофон соседа,
 * смена хозяина, heartbeat).
 */
export function encodingChanged(
  previous: VideoEncoding | null,
  next: VideoEncoding,
): boolean {
  if (!previous) return true;
  return (
    previous.maxBitrate !== next.maxBitrate ||
    previous.maxFramerate !== next.maxFramerate ||
    previous.scaleResolutionDownBy !== next.scaleResolutionDownBy
  );
}
