import type { ChatCallSignal } from '@vedamatch/shared';

/**
 * Сигнал «моя камера включена/выключена» (VED-291) — разбор и сборка.
 *
 * Зачем он вообще нужен. WebRTC о выключенной камере не сообщает: и веб
 * (`setCameraOff`), и приложение просто снимают `track.enabled`, а
 * отправитель при этом продолжает гнать кадры — чёрные. У собеседника
 * получается неотличимо от «картинка замёрзла»/«плохая связь», и он не
 * понимает, ждать ли. Поэтому факт отправляется явным сигналом по тому же
 * каналу, что offer/answer/ICE (`kind: 'media'`, `packages/shared/src/chat.ts`).
 *
 * Устойчивость к пропаже. Сигнал может не дойти (обрыв `/chat/stream`,
 * перезапуск ICE, дочитывание с `after=` уже после вытеснения из очереди),
 * поэтому получатель НИКОГДА не считает молчание за «камера выключена»:
 * умолчание — «включена», то есть ровно прежнее поведение. А отправитель
 * повторяет своё текущее состояние на каждом `connected`
 * (`call-provider.tsx`) — так картинка сходится после любого разрыва.
 *
 * Совместимость со старым собеседником (сайт до своей правки): он этот вид
 * сигнала не пошлёт никогда, и мы покажем его видео как раньше; получив наш,
 * он молча выйдет из `handleSignal` (там `signal.candidate === undefined`).
 */

/** Что этот модуль знает про состояние медиа собеседника. */
export interface RemoteMediaState {
  /** Камера собеседника включена. Умолчание — `true`, см. шапку. */
  video: boolean;
}

export const DEFAULT_REMOTE_MEDIA: RemoteMediaState = { video: true };

export function buildMediaSignal(videoOn: boolean): ChatCallSignal {
  return { kind: 'media', media: { video: videoOn } };
}

/**
 * Прочитать состояние камеры из сигнала. `null` — «это не про медиа»
 * (offer/answer/кандидат) либо форма испорчена: испорченное игнорируем, а
 * не подставляем `false`, иначе чужой мусор погасил бы живое видео.
 */
export function readMediaSignal(signal: ChatCallSignal): RemoteMediaState | null {
  if (signal.kind !== 'media') return null;
  const media = (signal as { media?: unknown }).media;
  if (!media || typeof media !== 'object') return null;
  const video = (media as { video?: unknown }).video;
  if (typeof video !== 'boolean') return null;
  return { video };
}

/**
 * Слать ли сигнал. Состояние повторяется только когда оно изменилось либо
 * когда его ещё ни разу не отправляли в этом соединении (`last === null` —
 * так же трактуется и момент после `connected`, где отправитель намеренно
 * сбрасывает отметку, чтобы повторить текущее состояние заново).
 * Дребезг кнопки «камера» туда-обратно не порождает очереди одинаковых
 * сигналов — каждый из них стоит сетевого запроса с ретраями.
 */
export function shouldAnnounceMedia(last: boolean | null, next: boolean): boolean {
  return last !== next;
}

/**
 * Связь только что восстановилась (`reconnecting` был, и его не стало) —
 * повод сообщить состояние камеры заново.
 *
 * Пока связи не было, наш сигнал мог не доехать: очередь сигналов на
 * сервере ограничена 50 на получателя и старое вытесняется, а собеседник в
 * это время мог вообще перезапустить соединение по ICE restart. Отдельная
 * функция, а не сравнение в теле эффекта, потому что переход односторонний:
 * «стало плохо» (false→true) повторять ничего не нужно — сигнал всё равно
 * не дойдёт, а очередь он займёт.
 */
export function reconnectRestored(previous: boolean, next: boolean): boolean {
  return previous && !next;
}
