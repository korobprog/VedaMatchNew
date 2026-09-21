"use client";

/**
 * Качество исходящего видео в групповой комнате — веб-часть (VED-293,
 * этап 4).
 *
 * Порт `group-video-quality.ts` приложения. Лестница по составу та же и по
 * той же причине: в mesh'е у каждого соединения свой кодер, и вдвоём
 * браузер кодирует кадр один раз, втроём — дважды, вчетвером — трижды.
 * Значит потолок, безобидный вдвоём, вчетвером означает утроенный трафик
 * вверх и три параллельных кодирования; на ноутбуке это вентилятор и
 * батарея, в браузере телефона — ровно то же, что и в приложении.
 *
 * Отличие от приложения одно: базового потолка «по транспорту» здесь нет.
 * Нативная подписка на смену сети (`subscribeToNetworkTransportChanges`)
 * — это Android API, а браузерный `navigator.connection` не поддержан
 * Safari вовсе и на десктопе врёт про Wi-Fi. Гадать по нему значит ронять
 * качество проводному собеседнику ни за что. Поэтому база здесь одна и
 * фиксированная, а адаптацию к реальному каналу оставляем самому WebRTC:
 * `degradationPreference: "balanced"` даёт ему право ронять и разрешение,
 * и частоту кадров, когда канал не тянет.
 *
 * Пересчитывается на каждое изменение состава — и на вход, и на выход:
 * оставшийся вдвоём обязан получить картинку обратно, а не доживать
 * разговор на 360p.
 */

export interface VideoEncoding {
  maxBitrate: number;
  maxFramerate: number;
  scaleResolutionDownBy: number;
}

export type DegradationPreference =
  | "balanced"
  | "maintain-framerate"
  | "maintain-resolution";

export const DEGRADATION_PREFERENCE: DegradationPreference = "balanced";

/** Потолок для пары — то же, что `WIDE` у приложения на Wi-Fi. */
const BASE: VideoEncoding = {
  maxBitrate: 1_200_000,
  maxFramerate: 30,
  scaleResolutionDownBy: 1,
};

interface QualityStep {
  bitrate: number;
  scale: number;
  framerate: number;
}

/** Индекс = число участников; таблица совпадает с приложением. */
const STEPS: readonly QualityStep[] = [
  { bitrate: 1, scale: 1, framerate: 30 },
  { bitrate: 1, scale: 1, framerate: 30 },
  { bitrate: 1, scale: 1, framerate: 30 },
  { bitrate: 0.5, scale: 1.5, framerate: 24 },
  { bitrate: 1 / 3, scale: 2, framerate: 20 },
];

/** Ниже этого лицо превращается в кашу. */
export const MIN_GROUP_VIDEO_BITRATE = 150_000;

export function groupVideoEncoding(participantCount: number): VideoEncoding {
  const step = STEPS[clampIndex(participantCount)];
  return {
    maxBitrate: Math.max(
      Math.round(BASE.maxBitrate * step.bitrate),
      MIN_GROUP_VIDEO_BITRATE,
    ),
    maxFramerate: Math.min(BASE.maxFramerate, step.framerate),
    scaleResolutionDownBy: BASE.scaleResolutionDownBy * step.scale,
  };
}

function clampIndex(participantCount: number): number {
  if (!Number.isFinite(participantCount) || participantCount < 0) return 0;
  return Math.min(Math.floor(participantCount), STEPS.length - 1);
}

/** Изменилось ли качество — чтобы не звать `setParameters` впустую. */
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

/**
 * Наложить потолок на параметры отправителя.
 *
 * `null` — менять нечего: `setParameters` отвергает параметры, собранные
 * не из свежего `getParameters`, и звать его на каждое событие комнаты
 * незачем. Остальные поля (`transactionId`, `rid`, `codecs`…) сохраняются
 * дословно — по той же причине.
 *
 * Пустой `encodings` (дорожка ещё не привязана к транспорту) значит
 * «накладывать не на что», а не «выдумать encoding».
 */
export function withVideoEncoding(
  params: RTCRtpSendParameters,
  target: VideoEncoding,
  degradationPreference: DegradationPreference = DEGRADATION_PREFERENCE,
): RTCRtpSendParameters | null {
  const encodings = params.encodings;
  if (!Array.isArray(encodings) || encodings.length === 0) return null;

  const current = (
    params as RTCRtpSendParameters & {
      degradationPreference?: DegradationPreference;
    }
  ).degradationPreference;
  const alreadySet =
    current === degradationPreference &&
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
  } as RTCRtpSendParameters;
}
