import { DONATE_EXPENSES } from "@/lib/donate-content";

/**
 * «На что уходят деньги» (VED-62). Статьи — в `lib/donate-content.ts`.
 *
 * Только названия и пояснения: суммы заказчик со страницы убрал (VED-12,
 * правка от 21.09) — и цифры, и «уточняется» на их месте, и обещание
 * опубликовать их позже. Остался честный список, за что портал платит каждый
 * месяц; полосу-долю тоже сняли — считать её стало не от чего.
 */
export function ExpenseBreakdown() {
  return (
    <ul className="glass space-y-3 rounded-2xl border border-glass-brd p-5">
      {DONATE_EXPENSES.map((expense) => (
        <li key={expense.id}>
          <span className="text-sm font-medium text-text-0">{expense.title}</span>
          <p className="mt-0.5 text-xs text-text-1">{expense.note}</p>
        </li>
      ))}
    </ul>
  );
}
