"use client";

import { useEffect, useRef, useState } from "react";

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

      <div className="flex h-6 flex-1 items-center gap-[3px]" aria-hidden>
        {bars.map((level, index) => {
          const played = index / bars.length <= progress;
          return (
            <span
              key={index}
              style={{ height: `${Math.max(12, level)}%` }}
              className={`w-[3px] rounded-sm ${played ? "bg-cyan" : "bg-white/25"}`}
            />
          );
        })}
      </div>

      <span className="shrink-0 font-mono text-[11px] text-text-1">
        {duration}
      </span>
    </div>
  );
}
