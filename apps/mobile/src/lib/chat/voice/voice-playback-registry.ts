/**
 * Играет только одно голосовое сразу — как в любом мессенджере. Плеер
 * сообщает сюда, что начал играть, и получает обратно колбэк «остановись»,
 * если до него уже играл другой; входящий звонок останавливает вообще всё
 * через `stopActiveVoicePlayback`.
 *
 * Модуль-синглтон, а не React-контекст: список голосовых в ленте
 * виртуализирован (`FlatList`), и плееру нужно достучаться до соседа, даже
 * если тот уже вне дерева видимых элементов.
 */
type StopFn = () => void;

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
