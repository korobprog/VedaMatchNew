"use client";

import type { UnionProfileCompleteness } from "@vedamatch/shared";
import { unionProfileFieldLabels } from "./dictionaries";

/** Цвет полосы подсказывает, насколько анкета готова к показу в рекомендациях. */
function barColor(percent: number): string {
  if (percent >= 70) return "bg-cyan";
  if (percent >= 40) return "bg-gold";
  return "bg-magenta";
}

export function UnionProfileProgress({
  completeness,
  saveState,
}: {
  completeness: UnionProfileCompleteness;
  saveState: "idle" | "saving" | "saved" | "error";
}) {
  const { percent, next } = completeness;

  return (
    <div className="glass sticky top-2 z-10 mb-4 rounded-2xl border border-glass-brd p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-text-0">
          Заполнен на {percent}%
        </p>
        <p
          aria-live="polite"
          className={
            saveState === "error" ? "text-xs text-magenta" : "text-xs text-text-2"
          }
        >
          {saveState === "saving" && "Сохранение…"}
          {saveState === "saved" && "Сохранено"}
          {saveState === "error" && "Не удалось сохранить"}
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Заполненность профиля"
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-bg-1"
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor(percent)}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {next ? (
        <p className="mt-2 text-xs text-text-2">
          Дальше: {unionProfileFieldLabels[next]}
        </p>
      ) : (
        <p className="mt-2 text-xs text-text-2">
          Анкета заполнена полностью — так вас найдут быстрее.
        </p>
      )}
    </div>
  );
}
