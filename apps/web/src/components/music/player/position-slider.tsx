"use client";

import { formatTrackDuration } from "@/lib/music-duration";

/**
 * Дорожка. Ползунок настоящий, а не полоска с обработчиком клика: он даёт
 * стрелки, Home/End и объявление позиции без единой строки кода.
 *
 * Видимая линия — 3px, как в макете, но сам элемент высотой 24px: цель
 * меньше 24×24 не проходит по WCAG 2.5.8, а попасть пальцем в три пикселя
 * не выйдет и без всякого стандарта.
 */
export function MusicPositionSlider({
  position,
  total,
  onSeek,
  /** Раскладка снаружи: у полосы плеера и у виджета на главной она разная. */
  className = "flex w-full min-w-0 items-center gap-2",
}: {
  position: number;
  total: number;
  onSeek: (seconds: number) => void;
  className?: string;
}) {
  const percent = total > 0 ? Math.min(100, (position / total) * 100) : 0;

  return (
    <div className={className}>
      <span className="font-mono text-[10px] tabular-nums text-text-2">
        {formatTrackDuration(position)}
      </span>
      <label className="relative flex min-w-0 flex-1 items-center">
        <span className="sr-only">Позиция записи</span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 h-[3px] overflow-hidden rounded-full bg-glass-brd"
        >
          <span
            className="block h-full rounded-full bg-violet"
            style={{ width: `${percent}%` }}
          />
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(1, total)}
          step={1}
          value={position}
          // Время словами: «128» в объявлении читалки бесполезно.
          aria-valuetext={`${formatTrackDuration(position)} из ${formatTrackDuration(total)}`}
          onChange={(event) => onSeek(Number(event.target.value))}
          className="relative h-6 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-4.5px] [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet"
        />
      </label>
      <span className="font-mono text-[10px] tabular-nums text-text-2">
        {formatTrackDuration(total)}
      </span>
    </div>
  );
}
