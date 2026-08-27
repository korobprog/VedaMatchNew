import type { UnionSwipeDecision } from "@vedamatch/shared";

/**
 * Пометка «решение по этой анкете уже принято».
 *
 * Нужна там, где выдача намеренно показывает отсмотренных — в режиме
 * «показать всех». Без неё человек решает второй раз вслепую: ставит лайк
 * тому, кому запрос уже отправлен, и ждёт ответа дважды.
 *
 * Формулировки разные не для красоты. Пропуск — решение ни о чём: никому
 * ничего не ушло. Лайк и суперлайк — отправленный запрос, который сейчас
 * лежит у человека на той стороне, и знать об этом важнее.
 */
const LABELS: Record<UnionSwipeDecision, { full: string; short: string }> = {
  like: { full: "Вы отправили запрос", short: "Запрос отправлен" },
  superlike: { full: "Вы отправили суперлайк", short: "Суперлайк" },
  pass: { full: "Вы пропускали эту анкету", short: "Пропущена" },
};

export function DecisionBadge({
  decision,
  variant = "plain",
}: {
  decision: UnionSwipeDecision | null;
  /** `overlay` — поверх фотографии, белым по затемнению; `plain` — на фоне темы. */
  variant?: "overlay" | "plain";
}) {
  if (!decision) return null;
  const label = LABELS[decision];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs ${
        variant === "overlay"
          ? // h-7 — общая высота строки для всего, что лежит поверх фото:
            // иначе пилюли слева и справа стоят на разных уровнях.
            // Без backdrop-filter намеренно: пилюля едет вместе с карточкой,
            // и размытие пересчитывалось бы каждый кадр жеста.
            "h-7 bg-black/65 text-white"
          : "border border-glass-brd bg-bg-2 py-1 text-text-1"
      }`}
    >
      <CheckGlyph />
      {variant === "overlay" ? label.full : label.short}
    </span>
  );
}

/** Галочка «уже сделано» — тот же смысл, что у прочитанного сообщения. */
function CheckGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4 12.5 5 5L20 6.5" />
    </svg>
  );
}
