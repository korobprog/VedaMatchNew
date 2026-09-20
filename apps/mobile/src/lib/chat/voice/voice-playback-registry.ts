import { pickNextUnheardVoiceId, type VoiceOrderEntry } from './voice-playback-order';

/**
 * Играет только одно голосовое сразу — как в любом мессенджере. Плеер
 * сообщает сюда, что начал играть, и получает обратно колбэк «остановись»,
 * если до него уже играл другой; входящий звонок останавливает вообще всё
 * через `stopActiveVoicePlayback`.
 *
 * Тот же модуль знает порядок голосовых в переписке (`registerVoiceOrder`) и
 * умеет сам запускать следующее непрослушанное, когда текущее доиграло
 * (`markVoiceFinished`) — выбор кандидата чистый (`voice-playback-order.ts`),
 * здесь только связь с реально смонтированными плеерами.
 *
 * Модуль-синглтон, а не React-контекст: список голосовых в ленте
 * виртуализирован (`FlatList`), и плееру нужно достучаться до соседа, даже
 * если тот уже вне дерева видимых элементов.
 *
 * Ограничение автоперехода: он находит только СМОНТИРОВАННЫХ соседей
 * (зарегистрированных через `registerVoiceOrder`) — голосовое, которое
 * виртуализация ещё не отрисовала ни разу, программе неизвестно, как и
 * мессенджерам с виртуализированной лентой вообще.
 */
type StopFn = () => void;
type PlayFn = () => void;

let activeId: string | null = null;
let activeStop: StopFn | null = null;

/** Плеер вызывает перед началом воспроизведения. */
export function requestVoicePlayback(id: string, stop: StopFn): void {
  if (activeId !== null && activeId !== id) activeStop?.();
  activeId = id;
  activeStop = stop;
}

/** Плеер вызывает на паузе/остановке/размонтировании — только если он ещё активен. */
export function releaseVoicePlayback(id: string): void {
  if (activeId !== id) return;
  activeId = null;
  activeStop = null;
}

/** Входящий звонок (`voice-call-guard.ts`) — гасит текущее воспроизведение целиком. */
export function stopActiveVoicePlayback(): void {
  const stop = activeStop;
  activeId = null;
  activeStop = null;
  stop?.();
}

export function getActiveVoicePlaybackId(): string | null {
  return activeId;
}

// ===== Порядок и автопереход (VED-289) =====

const orderById = new Map<string, number>();
const playById = new Map<string, PlayFn>();
const heardIds = new Set<string>();

/**
 * Плеер регистрирует себя при монтировании: свою позицию в переписке
 * (`order`, см. `voice-playback-order.ts`) и функцию, которой можно
 * попросить его начать играть. Возвращает функцию отписки — обязательна на
 * размонтировании, иначе виртуализация оставит в реестре мёртвый колбэк.
 */
export function registerVoiceOrder(id: string, order: number, play: PlayFn): () => void {
  orderById.set(id, order);
  playById.set(id, play);
  return () => {
    if (orderById.get(id) === order) orderById.delete(id);
    if (playById.get(id) === play) playById.delete(id);
  };
}

/**
 * Голосовое доиграло до конца (вручную или уже в рамках автоперехода).
 * Помечает его прослушанным и, если среди смонтированных соседей ниже по
 * переписке есть непрослушанное, запускает его. Вызывать РОВНО ОДИН РАЗ на
 * каждое реальное завершение — защита от повторного срабатывания (например,
 * от дребезга статуса плеера) лежит на самом плеере (`finishedRef` в
 * `voice-message-player.tsx`), не здесь.
 */
export function markVoiceFinished(id: string): void {
  heardIds.add(id);
  const entries: VoiceOrderEntry[] = Array.from(orderById, ([entryId, order]) => ({ id: entryId, order }));
  const nextId = pickNextUnheardVoiceId(entries, id, heardIds);
  if (nextId === null) return;
  playById.get(nextId)?.();
}

export function isVoiceHeard(id: string): boolean {
  return heardIds.has(id);
}

/** Только для тестов — синглтон переживает между ними. */
export function resetVoicePlaybackOrderForTests(): void {
  orderById.clear();
  playById.clear();
  heardIds.clear();
}
