"use client";

import type { UnionCompatibility } from "@vedamatch/shared";
import { criterionLabels } from "./labels";

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Процент совместимости кольцом — центр панели решений.
 *
 * Раньше он висел плоским бейджем у имени и читался как ярлык. Здесь он
 * занимает середину между «нет» и «да», потому что это единственная цифра,
 * ради которой стоит задержаться на анкете. По нажатию раскрывается разбор:
 * проценту без объяснения верят ровно один раз.
 */
export function CompatibilityRing({
  total,
  size,
  onClick,
  expanded,
}: {
  total: number;
  size: number;
  onClick: () => void;
  expanded: boolean;
}) {
  const filled = (Math.min(100, Math.max(0, total)) / 100) * CIRCUMFERENCE;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-label={`Совместимость ${total}%. Показать, из чего она сложилась`}
      style={{ width: size, height: size }}
      // Тот же корпус, что у кнопок решений рядом: блик сверху, затемнение
      // к низу, светлая рамка и падающая тень.
      className="relative flex shrink-0 items-center justify-center rounded-full border border-white/30 bg-gradient-to-b from-white/25 to-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-2px_4px_rgba(0,0,0,0.35),0_6px_16px_rgba(0,0,0,0.5)] backdrop-blur-md transition hover:from-white/35 active:translate-y-px"
    >
      <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full">
        <circle
          cx="32"
          cy="32"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-white/20"
        />
        <circle
          cx="32"
          cy="32"
          r={RADIUS}
          fill="none"
          stroke="var(--vm-magenta)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
          // Отсчёт от двенадцати часов по часовой стрелке: круг, начатый
          // справа, читается как случайный обрезок дуги.
          transform="rotate(-90 32 32)"
        />
      </svg>
      <span className="relative font-mono text-sm font-bold text-white">
        {total}%
      </span>
    </button>
  );
}

/**
 * Разбор процента: вклад каждого критерия. Живёт поверх фото, поэтому цвета
 * не токены темы, а белый по затемнению — под ним произвольный снимок.
 */
export function CompatibilityBreakdown({
  compatibility,
  onClose,
}: {
  compatibility: UnionCompatibility;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col rounded-3xl bg-black/80 p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="font-display text-lg font-bold text-white">
          Почему {compatibility.total}%
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть разбор совместимости"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-lg text-white transition hover:bg-white/25"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <dl className="space-y-3 overflow-y-auto">
        {compatibility.breakdown.map((row) => (
          <div key={row.criterion}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <dt className="text-sm text-white/85">
                {criterionLabels[row.criterion]}
              </dt>
              <dd className="font-mono text-sm font-semibold text-white">
                {row.score}%
              </dd>
            </div>
            <span className="block h-1.5 overflow-hidden rounded-full bg-white/20">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-magenta to-[#B23EFF]"
                style={{ width: `${row.score}%` }}
              />
            </span>
            <p className="mt-1 text-xs text-white/60">
              Вес критерия — {row.weight}%
            </p>
          </div>
        ))}
      </dl>
    </div>
  );
}
