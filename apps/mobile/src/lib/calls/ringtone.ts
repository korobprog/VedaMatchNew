import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { startRingingVibration, stopRingingVibration } from '@/lib/feedback';

/**
 * Рингтон звонка — аналог `apps/web/src/components/chat/calls/ringtone.ts`.
 * Сайт синтезирует гудки через `AudioContext` (WebAudio), которого в React
 * Native нет, поэтому здесь короткий WAV по кругу через `expo-audio`
 * (решение и версия пакета — `docs/mobile-calls-native.md`).
 *
 * Входящему — двойной сигнал с паузой (880/660 Гц, тот же рисунок, что на
 * сайте) плюс вибрация: звонок продолжается, пока на него не ответили или
 * не отклонили, поэтому вибрация здесь длится вместе со звуком, а не
 * однократный отклик (`lib/feedback.ts`). Исходящему — тихий одиночный тон
 * раз в четыре секунды, без вибрации: это мы ждём ответа, а не нас будят.
 */
export type RingtoneKind = 'incoming' | 'outgoing';

const SOURCES: Record<RingtoneKind, number> = {
  incoming: require('../../../assets/audio/ringtone-incoming.wav'),
  outgoing: require('../../../assets/audio/ringtone-outgoing.wav'),
};

const VOLUME: Record<RingtoneKind, number> = {
  incoming: 0.9,
  outgoing: 0.5,
};

/** Возвращает функцию остановки — вызывается один раз при выходе из фазы гудков. */
export function startRingtone(kind: RingtoneKind): () => void {
  let player: AudioPlayer | null = null;
  try {
    player = createAudioPlayer(SOURCES[kind], { updateInterval: 1000 });
    player.loop = true;
    player.volume = VOLUME[kind];
    player.play();
  } catch {
    // Звук не поднялся (занят аудиовыход и т.п.) — баннер и вибрация всё
    // равно доносят «вам звонят», тишина не должна ронять звонок.
    player = null;
  }
  if (kind === 'incoming') startRingingVibration();

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    if (kind === 'incoming') stopRingingVibration();
    try {
      player?.pause();
      player?.remove();
    } catch {
      // Плеер уже мог быть выгружен системой — не мешаем звонку завершиться.
    }
  };
}
