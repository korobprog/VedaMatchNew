import {
  ASTRO_COMPATIBILITY_PURPOSES,
  ASTRO_PURPOSE_TITLES,
  gunaMilanMaxFor,
  type AstroCompatibilityPurpose,
} from "@vedamatch/shared";

/**
 * Меню целей сверки карт — то, что спрашивает сервис перед отправкой запроса:
 * ради чего сверяем. Максимум очков у каждой цели свой, и он тут же подписан:
 * это и есть главное отличие, ради которого цель вообще выбирают.
 *
 * Всплывает от кнопки в углу карточки, а не занимает строку под тегами:
 * текстовая ссылка налезала на интересы и читалась как чужеродная.
 */
export function DeckAstroMenu({
  onPick,
  onClose,
}: {
  onPick: (purpose: AstroCompatibilityPurpose) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-3 top-12 z-30 w-[168px] rounded-2xl border border-white/15 bg-black/85 p-2 shadow-xl backdrop-blur-sm">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <p className="text-[11px] font-semibold text-white/85">
          Ради чего сверяем?
        </p>
        <button
          type="button"
          data-deck-action="close"
          onClick={onClose}
          aria-label="Закрыть выбор цели"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15 text-[10px] text-white transition hover:bg-white/25"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <ul className="space-y-0.5">
        {ASTRO_COMPATIBILITY_PURPOSES.map((purpose) => (
          <li key={purpose}>
            <button
              type="button"
              data-deck-action={`astro-${purpose}`}
              onClick={() => onPick(purpose)}
              className="flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/10"
            >
              <span className="text-xs text-white">
                {ASTRO_PURPOSE_TITLES[purpose]}
              </span>
              <span className="font-mono text-[10px] text-white/50">
                до {gunaMilanMaxFor(purpose)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
