import type { NetworkTransport } from '../../../modules/vedamatch-calls';

/**
 * Потолок качества исходящего видео под сеть телефона (VED-291).
 *
 * Зачем. Камера просится `1280×720` (`webrtc-session.ts#startLocalMedia`), и
 * без потолка libwebrtc на хорошем кадре разгоняет битрейт до нескольких
 * мегабит. В Wi-Fi это нормально, в сотовой сети — счёт за трафик, нагрев и
 * та самая «картинка рассыпается» при первом же провале канала: адаптация
 * libwebrtc по потере пакетов реагирует уже ПОСЛЕ того, как пакеты
 * потерялись. Потолок ставится заранее, `RTCRtpSender.setParameters` —
 * без пересогласования SDP, собеседнику ничего не приходит.
 *
 * Значения — обычный порядок для звонка один на один: Wi-Fi/Ethernet
 * ~1,2 Мбит при полном кадре, сотовая ~600 кбит с уменьшением стороны вдвое
 * (то есть 640×360 — на телефоне в руке разницы почти не видно, а трафика
 * вчетверо меньше по площади кадра). `degradationPreference: 'balanced'` —
 * при нехватке канала libwebrtc жертвует и разрешением, и частотой кадров;
 * для разговора «говорящая голова» это ровнее, чем ронять только частоту
 * (`maintain-resolution`) и получать рывки.
 *
 * Чистый модуль: сам `RTCRtpSender` здесь не трогается (это нативный мост),
 * только вычисление потолка и наложение его на объект параметров —
 * применение в `webrtc-session.ts#applyVideoEncoding`.
 */

export interface VideoEncoding {
  maxBitrate: number;
  maxFramerate: number;
  scaleResolutionDownBy: number;
}

export type DegradationPreference = 'balanced' | 'maintain-framerate' | 'maintain-resolution';

export const DEGRADATION_PREFERENCE: DegradationPreference = 'balanced';

const WIDE: VideoEncoding = { maxBitrate: 1_200_000, maxFramerate: 30, scaleResolutionDownBy: 1 };
const NARROW: VideoEncoding = { maxBitrate: 600_000, maxFramerate: 24, scaleResolutionDownBy: 2 };

/**
 * Потолок для транспорта. `'none'` (сети нет) и `'other'`/`null` (транспорт
 * неизвестен — например, подписка ещё не прислала первое значение) считаем
 * узкими: ошибиться в сторону экономии безопаснее, чем в сторону мегабит по
 * мобильному тарифу, а как только транспорт станет известен, потолок
 * пересчитается.
 */
export function videoEncodingFor(transport: NetworkTransport | null): VideoEncoding {
  if (transport === 'wifi' || transport === 'ethernet') return WIDE;
  return NARROW;
}

/**
 * Форма параметров отправителя, которая нас интересует (опубликованные типы
 * `react-native-webrtc` её не дают). Индексная сигнатура — намеренно: в
 * `encodings` приходят поля, о которых мы не знаем и знать не должны
 * (`rid`, `active`, `ssrc`…), и их надо сохранить дословно.
 */
export interface SenderEncoding extends Partial<VideoEncoding> {
  [key: string]: unknown;
}

export interface SenderParameters {
  encodings?: SenderEncoding[];
  degradationPreference?: string;
  [key: string]: unknown;
}

/**
 * Наложить потолок на параметры отправителя.
 *
 * Возвращает `null`, когда менять нечего: `setParameters` — вызов через
 * нативный мост, и дёргать его на каждое событие сети впустую не нужно.
 * Остальные поля параметров (`transactionId`, `codecs`, `rid` у каждого
 * encoding…) сохраняются как есть — libwebrtc отвергает `setParameters`,
 * если ему вернули не то, что он выдал из `getParameters`.
 *
 * Пустой `encodings` (бывает, пока дорожка не привязана к транспорту)
 * значит «накладывать не на что» — тоже `null`, а не выдуманный encoding.
 */
export function withVideoEncoding(
  params: SenderParameters,
  target: VideoEncoding,
  degradationPreference: DegradationPreference = DEGRADATION_PREFERENCE,
): SenderParameters | null {
  const encodings = params.encodings;
  if (!Array.isArray(encodings) || encodings.length === 0) return null;

  const alreadySet =
    params.degradationPreference === degradationPreference &&
    encodings.every(
      (encoding) =>
        encoding.maxBitrate === target.maxBitrate &&
        encoding.maxFramerate === target.maxFramerate &&
        encoding.scaleResolutionDownBy === target.scaleResolutionDownBy,
    );
  if (alreadySet) return null;

  return {
    ...params,
    degradationPreference,
    encodings: encodings.map((encoding) => ({ ...encoding, ...target })),
  };
}
