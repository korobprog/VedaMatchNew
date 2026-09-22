"use client";

import type { ChatCallSignal } from "@vedamatch/shared";

/**
 * Сигнал «моя камера сейчас снимает / не снимает» — веб-часть.
 *
 * Порт `apps/mobile/src/lib/calls/media-state-signal.ts` (VED-291, #436).
 * Вид сигнала `{kind:'media'}` описан в `packages/shared/src/chat.ts` и
 * общий для сайта и приложения — расходиться этим двум нельзя, иначе
 * телефон и браузер в одной комнате перестают понимать друг друга.
 *
 * Зачем он вообще нужен в ГРУППЕ. Место под видео сервер держит за
 * человеком, пока тот в звонке, — в том числе пока его вкладка скрыта или
 * приложение свёрнуто. Камеру в это время мы гасим
 * (`group-video-state.ts#videoDimmedByBackground`), а WebRTC про остановку
 * дорожки не сообщает: у остальных на плитке замерзает последний кадр, и
 * отличить это от «связь пропала» нельзя. Поэтому факт сообщается явно.
 *
 * Устойчивость к пропаже. Сигнал может не дойти (обрыв `/chat/stream`,
 * перезапуск ICE, вытеснение из очереди), поэтому получатель НИКОГДА не
 * считает молчание за «камера выключена»: умолчание — «снимает». А
 * отправитель повторяет своё состояние на каждом `connected`.
 */

export interface RemoteMediaState {
  /** Камера собеседника снимает. Умолчание — `true`, см. шапку. */
  video: boolean;
}

export const DEFAULT_REMOTE_MEDIA: RemoteMediaState = { video: true };

export function buildMediaSignal(videoOn: boolean): ChatCallSignal {
  return { kind: "media", media: { video: videoOn } };
}

/**
 * Прочитать состояние камеры из сигнала. `null` — «это не про медиа»
 * (offer/answer/кандидат) либо форма испорчена: испорченное игнорируем, а
 * не подставляем `false`, иначе чужой мусор погасил бы живое видео.
 */
export function readMediaSignal(
  signal: ChatCallSignal,
): RemoteMediaState | null {
  if (signal.kind !== "media") return null;
  const media = (signal as { media?: unknown }).media;
  if (!media || typeof media !== "object") return null;
  const video = (media as { video?: unknown }).video;
  if (typeof video !== "boolean") return null;
  return { video };
}

/**
 * Слать ли сигнал. Только когда состояние изменилось либо когда его ещё ни
 * разу не отправляли в этом соединении (`last === null` — так же трактуется
 * момент после `connected`, где отправитель намеренно сбрасывает отметку).
 * Дребезг кнопки «камера» не порождает очереди одинаковых сигналов: каждый
 * стоит сетевого запроса с ретраями, а в mesh'е их ещё и трое.
 */
export function shouldAnnounceMedia(
  last: boolean | null,
  next: boolean,
): boolean {
  return last !== next;
}
