"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_VOICE_SPEED,
  formatVoiceSpeed,
  nextVoiceSpeed,
  parseVoiceSpeed,
  VOICE_SPEED_KEY,
  type VoiceSpeed,
} from "./voice-speed";

/* Скорость — одна на устройство и на все голосовые в переписке: сменил на
   одном — сменилась на всех. Поэтому это внешнее хранилище с подпиской, а не
   состояние каждого проигрывателя. `storage` доносит смену из другой
   вкладки, своё событие — из этой: `storage` в своей вкладке не приходит. */
const VOICE_SPEED_EVENT = "vedamatch:chat-voice-speed";

/* Скорость, которую не удалось записать в хранилище (приватный режим,
   запрет). Без неё кнопка там не переключала бы ничего: снимок читается из
   `localStorage`, а записи туда нет. */
let tabSpeed: VoiceSpeed | null = null;

function subscribeVoiceSpeed(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== VOICE_SPEED_KEY) return;
    tabSpeed = null;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(VOICE_SPEED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(VOICE_SPEED_EVENT, onChange);
  };
}

function readVoiceSpeed(): VoiceSpeed {
  if (tabSpeed !== null) return tabSpeed;
  try {
    return parseVoiceSpeed(window.localStorage.getItem(VOICE_SPEED_KEY));
  } catch {
    // Приватный режим и запрет хранилища — играем на обычной скорости.
    return DEFAULT_VOICE_SPEED;
  }
}

function useVoiceSpeed(): [VoiceSpeed, () => void] {
  const speed = useSyncExternalStore(
    subscribeVoiceSpeed,
    readVoiceSpeed,
    () => DEFAULT_VOICE_SPEED,
  );
  const cycle = () => {
    const next = nextVoiceSpeed(speed);
    try {
      window.localStorage.setItem(VOICE_SPEED_KEY, String(next));
      tabSpeed = null;
    } catch {
      // см. выше: не запомнится, но в этой вкладке переключится.
      tabSpeed = next;
    }
    window.dispatchEvent(new Event(VOICE_SPEED_EVENT));
  };
  return [speed, cycle];
}

/**
 * Проигрыватель голосового. Дорожка — сохранённые при записи уровни, а не
 * разбор файла на лету: считать волну заново на каждом открытии переписки
 * означает тянуть все голосовые целиком ради картинки.
 */
export function ChatVoicePlayer({
  url,
  waveform,
  duration,
}: {
  url: string;
  waveform: number[];
  duration: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, cycleSpeed] = useVoiceSpeed();

  /* `defaultPlaybackRate` — вдобавок к `playbackRate`: загрузка файла
     сбрасывает вторую к первой, а `preload="none"` значит, что загрузка
     случится как раз после нажатия «Слушать». */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.defaultPlaybackRate = speed;
    audio.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () =>
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  const bars = waveform.length > 0 ? waveform : Array(24).fill(30);

  return (
    <div className="flex items-center gap-3">
      <audio ref={audioRef} src={url} preload="none" />
      <button
        type="button"
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (playing) {
            audio.pause();
            setPlaying(false);
          } else {
            void audio.play();
            setPlaying(true);
          }
        }}
        aria-label={playing ? "Пауза" : "Слушать"}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-mint text-on-mint"
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5l11 7-11 7z" />
          </svg>
        )}
      </button>

      <div className="flex h-6 min-w-0 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden>
        {bars.map((level, index) => {
          const played = index / bars.length <= progress;
          return (
            <span
              key={index}
              style={{ height: `${Math.max(12, level)}%` }}
              className={`w-[3px] shrink-0 rounded-sm ${played ? "bg-cyan" : "bg-text-2/40"}`}
            />
          );
        })}
      </div>

      <span className="shrink-0 font-mono text-[11px] text-text-1">
        {duration}
      </span>

      {/* Скорость — чипом после длительности, как в мессенджерах. Цель 32
          точки в высоту: чип мелкий, но меньше 24×24 не проходит по WCAG
          2.5.8. Имя называет и текущую скорость, и то, что нажатие её сменит. */}
      <button
        type="button"
        onClick={cycleSpeed}
        aria-label={`Скорость ${formatVoiceSpeed(speed)}, сменить`}
        title="Скорость воспроизведения"
        className={`flex h-8 min-w-11 shrink-0 items-center justify-center rounded-full border border-glass-brd px-2 font-mono text-[11px] font-semibold transition-colors hover:text-text-0 ${
          speed === DEFAULT_VOICE_SPEED ? "text-text-1" : "text-text-0"
        }`}
      >
        {formatVoiceSpeed(speed)}
      </button>
    </div>
  );
}
