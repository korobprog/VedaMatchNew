import type { CallPhase } from '@/lib/calls/call-machine';
import type { GroupCallPhase } from '@/lib/group-calls/group-call-state';
import type { MediaTrack } from './media-parse';

/**
 * Связь плеера Медиатеки с системой (VED-331): что показать на экране
 * блокировки и в шторке и когда уступить звук звонку.
 */

export interface LockScreenMetadata {
  title: string;
  artist?: string;
  albumTitle?: string;
  artworkUrl?: string;
}

/**
 * Карточка в шторке и на экране блокировки. Пустых полей не передаём:
 * `expo-audio` рисует пустую строку как строку, и под названием висела бы
 * пустая подпись.
 */
export function lockScreenMetadata(track: MediaTrack): LockScreenMetadata {
  return {
    title: track.title,
    ...(track.artist ? { artist: track.artist } : {}),
    ...(track.album ? { albumTitle: track.album } : {}),
    ...(track.coverUrl ? { artworkUrl: track.coverUrl } : {}),
  };
}

/**
 * Кнопки шторки. «−10/+10» — «назад/вперёд» этапа 1: переход к соседней
 * записи появится вместе с очередью (этап 2), а `expo-audio` сейчас сам
 * убирает из сеанса команды «следующая/предыдущая».
 */
export const LOCK_SCREEN_OPTIONS = { showSeekBackward: true, showSeekForward: true, isLiveStream: false } as const;

/** Канал уведомления о воспроизведении. Id зашит в `expo-audio`. */
export const PLAYBACK_CHANNEL_ID = 'expo_audio_channel';
export const PLAYBACK_CHANNEL_NAME = 'Медиатека: воспроизведение';

/**
 * Занят ли звук звонком. Звонок один на один — от «зовём/зовут» до конца
 * разговора; групповой — от входа в комнату. `ended` — итоговый экран,
 * звонка уже нет.
 */
export function isCallBusy(chat: CallPhase | null | undefined, group: GroupCallPhase | null | undefined): boolean {
  const chatBusy = chat === 'outgoing' || chat === 'incoming' || chat === 'connecting' || chat === 'active';
  const groupBusy = group === 'joining' || group === 'active';
  return chatBusy || groupBusy;
}

/** Смена занятости: `started` — уступить, `ended` — можно вернуть звук. */
export function callTransition(wasBusy: boolean, isBusy: boolean): 'started' | 'ended' | null {
  if (!wasBusy && isBusy) return 'started';
  if (wasBusy && !isBusy) return 'ended';
  return null;
}
