import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';
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

/**
 * Веб: политика автовоспроизведения браузера (Chrome/Safari/Firefox) может
 * отклонить `HTMLMediaElement.play()`, если у страницы ещё не было
 * взаимодействия пользователя, — типичный случай именно здесь: входящий
 * звонок приходит сам, по SSE (`call-provider.tsx`), без клика прямо перед
 * этим. `expo-audio` на вебе (`AudioPlayerWeb.play()`) вызывает
 * `this.media.play()` и не читает и не пробрасывает его `Promise` дальше
 * (см. `node_modules/expo-audio/build/AudioPlayer.web.js`) — синхронный
 * `try/catch` вокруг `createAudioPlayer`/`player.play()` ниже эту ошибку
 * поэтому не ловит вообще: она превращается в необработанный отказ промиса
 * где-то в недрах браузера. Звонок это не ломает (баннер и вибрация всё
 * равно доносят «вам звонят», см. шапку файла), но красный `Uncaught (in
 * promise) DOMException` в консоли — не про реальную поломку, а про
 * ожидаемую политику автовоспроизведения. Подавляем ТОЛЬКО эти два
 * известных исхода `<video>/<audio>.play()` (`NotAllowedError` — политика,
 * `AbortError` — плеер успели поставить на паузу/выгрузить раньше, чем
 * промис успел решиться, обычное дело при быстром входящий→сброшенный),
 * остальные необработанные отказы промисов идут в консоль как обычно —
 * это не индульгенция на все ошибки страницы, только на эту конкретную.
 */
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { name?: string } | undefined;
    if (reason?.name === 'NotAllowedError' || reason?.name === 'AbortError') event.preventDefault();
  });
}

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
