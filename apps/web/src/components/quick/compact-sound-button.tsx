"use client";

import { CirclePause, CirclePlay } from "lucide-react";
import { useMusicPlayer } from "@/components/music/player/player-provider";
import { useMusicRadio } from "@/components/music/radio/radio-provider";
import { planCompactSound } from "./compact-sound";

/**
 * «Пуск / пауза» звука портала одним значком (VED-577) — для окон, которые
 * накрывают шапку с горячими кнопками «Плеер» и «Радио». Что делает нажатие,
 * решает `planCompactSound`.
 *
 * `tone="mint"` — мятный круг, как пуск в полосе плеера (VED-600): тёмный
 * значок `--vm-on-mint` на мяте, 7,48:1. Метка `data-sound-control` говорит
 * плееру, что у окна своя пауза и его пузырь поверх окна не нужен
 * (`hasForeignModal`).
 */
export function CompactSoundButton({
  className = "",
  tone = "plain",
}: {
  className?: string;
  tone?: "plain" | "mint";
}) {
  const player = useMusicPlayer();
  const radio = useMusicRadio();
  const plan = planCompactSound({
    radio: radio ? { active: radio.active, paused: radio.paused } : null,
    player: player
      ? { hasTrack: Boolean(player.current), isPlaying: player.isPlaying }
      : null,
  });
  if (!plan) return null;

  function run() {
    if (!plan) return;
    switch (plan.step) {
      case "radio-stop":
        radio?.stop();
        return;
      case "radio-resume":
        radio?.resume();
        return;
      case "player-pause":
      case "player-resume":
        player?.toggle();
    }
  }

  const Icon = plan.playing ? CirclePause : CirclePlay;
  return (
    <button
      type="button"
      onClick={run}
      aria-label={plan.label}
      title={plan.label}
      data-sound-control=""
      className={`flex shrink-0 items-center justify-center ${
        tone === "mint"
          ? "btn-mint size-10 rounded-full"
          : "size-11 rounded-lg text-text-1 transition-colors hover:bg-glass hover:text-text-0"
      } ${className}`}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}
