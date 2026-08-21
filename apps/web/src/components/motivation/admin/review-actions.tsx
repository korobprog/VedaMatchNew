"use client";

import { useState } from "react";
import type {
  MotivationAdminCandidateDto,
  MotivationVisualStyle,
} from "@vedamatch/shared";
import { dangerButton, fieldClass, labelClass } from "./ui";

export const visualStyles: ReadonlyArray<{
  value: MotivationVisualStyle;
  label: string;
}> = [
  { value: "spiritual_watercolor", label: "Духовная акварель" },
  { value: "cinematic_nature", label: "Кинематографичная природа" },
  { value: "indian_miniature", label: "Индийская миниатюра" },
  { value: "sacred_architecture", label: "Сакральная архитектура" },
  { value: "minimal_symbolism", label: "Минималистичный символизм" },
  { value: "warm_documentary", label: "Тёплая документалистика" },
  { value: "cosmic_contemplation", label: "Космическое созерцание" },
  { value: "historical_editorial", label: "Историческая редакционная иллюстрация" },
  { value: "cinematic_film", label: "Кинокадр — 35 мм, плёнка" },
  { value: "epic_wide", label: "Эпический широкий план" },
  { value: "night_devotional", label: "Ночное предстояние — свет лампады" },
  { value: "painterly_realism", label: "Живописный реализм" },
];

/**
 * Пустое значение селекта = «стиль не выбран руками». Раньше селект стартовал
 * с захардкоженной «Духовной акварели» и отправлял её при каждом подтверждении,
 * затирая стиль, который система подбирает по источнику цитаты: цитата из
 * Бхагавад-гиты уходила в генерацию акварелью вместо индийской миниатюры.
 */
export const autoVisualStyleLabel = "Автоматически — по смыслу и источнику";

export function StyleSelect({
  post,
  value,
  disabled,
  onChange,
}: {
  post: MotivationAdminCandidateDto;
  value: MotivationVisualStyle | null;
  disabled: boolean;
  onChange: (style: MotivationVisualStyle | null) => void;
}) {
  const label = `Стиль изображения для «${post.title || post.slug}»`;
  return (
    <label className={labelClass}>
      <span>Стиль изображения</span>
      <select
        aria-label={label}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) =>
          onChange((event.target.value || null) as MotivationVisualStyle | null)
        }
        className={`mt-2 ${fieldClass}`}
      >
        <option value="">{autoVisualStyleLabel}</option>
        {visualStyles.map((style) => (
          <option key={style.value} value={style.value}>
            {style.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Отклонение спрятано за раскрывающимся блоком: на телефоне липкая панель
 * ставит кнопки вплотную, и «Отклонить» рядом с «Одобрить» слишком легко задеть.
 */
export function RejectControl({
  post,
  disabled,
  pendingAction,
  onReject,
}: {
  post: MotivationAdminCandidateDto;
  disabled: boolean;
  pendingAction: string | undefined;
  onReject: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const label = `Причина отклонения для «${post.title || post.slug}»`;

  return (
    <details className="sm:col-span-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-text-2 hover:text-text-0">
        Отклонить…
      </summary>
      <div className="mt-3 space-y-2">
        <label className={labelClass}>
          <span className="sr-only">{label}</span>
          <textarea
            aria-label={label}
            value={reason}
            disabled={disabled}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Укажите, что необходимо исправить"
            rows={2}
            className={fieldClass}
          />
        </label>
        <button
          type="button"
          disabled={disabled || !reason.trim()}
          onClick={() => onReject(reason.trim())}
          className={dangerButton}
        >
          {pendingAction === "reject" ? "Отклонение…" : "Отклонить"}
        </button>
      </div>
    </details>
  );
}

export function ActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-4 -mb-4 mt-5 grid gap-3 rounded-b-2xl border-t border-glass-brd bg-bg-0/95 p-4 backdrop-blur sm:-mx-5 sm:-mb-5 sm:grid-cols-2 sm:p-5">
      {children}
    </div>
  );
}
