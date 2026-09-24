import { createAudioPlayer } from 'expo-audio';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ensurePlaybackAudioMode } from '@/lib/audio/app-audio-mode';
import { announceAudioStart, onYield } from '@/lib/audio/audio-arbiter';
import { useSession } from '@/lib/auth/session';
import { useChatCalls } from '@/lib/calls/chat-calls-context';
import { useGroupCalls } from '@/lib/group-calls/group-call-context';
import { createMediaApi } from './media-api';
import { createMediaEngine, type MediaEngine, type NativeMediaPlayer } from './media-engine';
import { ensurePlaybackChannel } from './media-notification-channel';
import { MediaPlayerContext, type MediaPlayerApi } from './media-player-context';
import { isCallBusy } from './media-session';

/**
 * Плеер Медиатеки на всё приложение (VED-331). Живёт в корне, под сессией и
 * звонками: звук не должен обрываться при уходе с экрана Медиатеки, а
 * звонок обязан его останавливать, где бы человек ни был.
 *
 * Здесь только проводка: логика — в `media-engine.ts` и
 * `player-state.ts`, которые проверяются тестами без телефона.
 */

/** Статус из натива раз в полсекунды: хватает и шкале, и истории. */
const STATUS_INTERVAL_MS = 500;

export function MediaPlayerProvider({ children }: { children: ReactNode }) {
  const { api, status } = useSession();
  const apiRef = useRef(api);
  apiRef.current = api;

  const [engine] = useState<MediaEngine>(() => {
    // Клиент берётся заново на каждый вызов: сессия может смениться (новый
    // вход), а движок живёт весь процесс.
    const media = () => createMediaApi(apiRef.current);
    return createMediaEngine({
      createPlayer: () =>
        createAudioPlayer(null, { updateInterval: STATUS_INTERVAL_MS }) as unknown as NativeMediaPlayer,
      api: {
        streamUrl: (id) => media().streamUrl(id),
        heartbeat: (body) => media().heartbeat(body),
        stopListening: () => media().stopListening(),
      },
      ensureAudioMode: ensurePlaybackAudioMode,
      ensureChannel: ensurePlaybackChannel,
      announce: announceAudioStart,
      onYield,
      now: Date.now,
    });
  });

  const state = useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);

  // Звонок один на один и групповой — оба занимают звук целиком.
  const calls = useChatCalls();
  const groupCalls = useGroupCalls();
  const callBusy = isCallBusy(calls?.state.phase, groupCalls?.state.phase);
  useEffect(() => {
    engine.setCallBusy(callBusy);
  }, [callBusy, engine]);

  // Выход из аккаунта: чужая лекция не должна доигрывать на экране входа.
  useEffect(() => {
    if (status !== 'signed') engine.stop();
  }, [engine, status]);

  // Провайдер живёт весь процесс; снятие с дерева (горячая перезагрузка,
  // строгий режим разработки) лишь останавливает звук, а не разбирает
  // движок: повторный монтаж того же `useState` получит его обратно живым.
  useEffect(() => () => engine.stop(), [engine]);

  const value = useMemo<MediaPlayerApi>(
    () => ({
      state,
      callBusy,
      playQueue: engine.playQueue,
      toggle: engine.toggle,
      play: engine.play,
      pause: engine.pause,
      seekTo: engine.seekTo,
      skip: engine.skip,
      next: engine.next,
      previous: engine.previous,
      stop: engine.stop,
    }),
    [callBusy, engine, state],
  );

  return <MediaPlayerContext.Provider value={value}>{children}</MediaPlayerContext.Provider>;
}
