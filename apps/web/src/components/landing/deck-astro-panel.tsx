import {
  ASTRO_PURPOSE_TITLES,
  type AstroCompatibilityPurpose,
} from "@vedamatch/shared";
import { demoGunaMilan, demoPurposeNote } from "@/lib/landing/guna-milan-demo";

/**
 * Сверка карт по звёздам поверх карточки колоды — то, куда ведёт переход
 * «Проверить совместимость по звёздам» из настоящей карточки.
 *
 * Цель приходит снаружи: её выбирают в меню перед сверкой, ровно как в
 * сервисе. Числа берутся из общей демонстрационной сводки, той же, что на
 * странице Астрологии, и по той же таблице кут, что считает сервер.
 */
export function DeckAstroPanel({
  purpose,
  onClose,
}: {
  purpose: AstroCompatibilityPurpose;
  onClose: () => void;
}) {
  const score = demoGunaMilan(purpose);
  // Показываем учтённые куты: снятые для этой цели не считаются, и место в
  // карточке лучше отдать тем, из которых итог и сложился.
  const shown = score.rows.filter((row) => row.counted).slice(0, 5);
  const note = demoPurposeNote(purpose);

  return (
    <div className="absolute inset-0 z-30 flex flex-col rounded-3xl bg-black/85 p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-display text-base font-bold text-white">
          Гуна-Милан · {ASTRO_PURPOSE_TITLES[purpose]}
        </p>
        <button
          type="button"
          data-deck-action="close"
          onClick={onClose}
          aria-label="Закрыть сверку карт"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <p className="mb-3 font-mono text-2xl font-bold text-white">
        {score.totalPoints}
        <span className="text-white/50"> / {score.maxPoints}</span>
      </p>

      <dl className="min-h-0 flex-1 space-y-2 overflow-hidden pr-1">
        {shown.map((row) => (
          <div key={row.key}>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-xs text-white/85">{row.title}</dt>
              <dd className="font-mono text-xs font-semibold text-white">
                {row.points}/{row.maxPoints}
              </dd>
            </div>
            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/20">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-magenta to-violet"
                style={{ width: `${(row.points / row.maxPoints) * 100}%` }}
              />
            </span>
          </div>
        ))}
      </dl>

      <p className="mt-2 shrink-0 text-[11px] leading-snug text-white/60">
        {note ? `${note}. ` : ""}Числа для примера, сверка — по согласию обеих
        сторон.
      </p>
    </div>
  );
}
