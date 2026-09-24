import { createContext, useContext } from 'react';
import type { MediaTrack } from './media-parse';
import type { PlayerState } from './player-state';

/**
 * Контекст плеера Медиатеки (VED-331) — отдельным файлом без `expo-audio`,
 * по тому же соображению, что и `chat-calls-context.ts`: экранам и
 * мини-плееру нужен только хук, а сам провайдер тянет нативный плеер.
 *
 * `null` — плеера нет: веб-версия (там Медиатека открывается сайтом со
 * своим плеером, `service-route.ts`) и тесты экранов без провайдера.
 */
export interface MediaPlayerApi {
  state: PlayerState;
  /** Идёт звонок: звук Медиатеки уступил разговору. */
  callBusy: boolean;
  playQueue(queue: MediaTrack[], index?: number): Promise<void>;
  toggle(): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seekTo(positionSec: number): void;
  skip(deltaSec: number): void;
  next(): Promise<void>;
  previous(): Promise<void>;
  stop(): void;
}

export const MediaPlayerContext = createContext<MediaPlayerApi | null>(null);

export function useMediaPlayer(): MediaPlayerApi | null {
  return useContext(MediaPlayerContext);
}
