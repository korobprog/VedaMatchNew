import { progressRatio } from './playback-math';
import { currentTrack, isActive, type PlayerState } from './player-state';

/**
 * Что показывает мини-плеер над вкладками (VED-331) — чистая часть, без
 * разметки: какая кнопка главная, что написать второй строкой, сколько
 * закрасить в полосе прогресса.
 */
export interface MiniPlayerView {
  title: string;
  /** Вторая строка: исполнитель, а в особых состояниях — само состояние. */
  subtitle: string;
  /** Главная кнопка: пауза, играть или повторить после ошибки. */
  primary: 'pause' | 'play' | 'retry';
  primaryLabel: string;
  progress: number;
  /** Ждём звук — вместо значка на главной кнопке крутилка. */
  waiting: boolean;
}

export function miniPlayerView(state: PlayerState, callBusy: boolean): MiniPlayerView | null {
  const track = currentTrack(state);
  if (!track || state.status === 'idle') return null;
  const active = isActive(state);
  const waiting = state.status === 'loading' || state.status === 'buffering';
  let subtitle = track.artist ?? track.album ?? 'Медиатека';
  if (state.status === 'error') subtitle = 'Не удалось воспроизвести';
  else if (callBusy && !active) subtitle = 'Пауза на время звонка';
  else if (state.status === 'loading') subtitle = 'Загружаем…';
  else if (state.status === 'ended') subtitle = 'Дослушано';
  const primary = state.status === 'error' ? 'retry' : active ? 'pause' : 'play';
  const primaryLabel = primary === 'retry' ? 'Повторить' : primary === 'pause' ? 'Пауза' : 'Играть';
  return {
    title: track.title,
    subtitle,
    primary,
    primaryLabel,
    progress: progressRatio(state.positionSec, state.durationSec),
    waiting,
  };
}
