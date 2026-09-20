import { buildExpenseBreakdown, formatRub } from "@/lib/donate";
import { DONATE_EXPENSES, DONATE_EXPENSES_PERIOD } from "@/lib/donate-content";

/**
 * «На что уходят деньги» (VED-62). Расчёт — в `lib/donate.ts`, суммы — в
 * `lib/donate-content.ts`.
 *
 * Текстом и полосами на токенах, а не картинкой: смету читают и скринридером,
 * и на телефоне, а картинка не даёт ни того, ни другого. Полоса — оформление
 * при уже написанной цифре, поэтому у неё `aria-hidden`.
 */
export function ExpenseBreakdown() {
  const { rows, total, unknownCount, hasAmounts } =
    buildExpenseBreakdown(DONATE_EXPENSES);

  return (
    <div className="glass rounded-2xl border border-glass-brd p-5">
      <p className="text-sm text-text-1">
        {hasAmounts ? (
          <>
            Расходы за месяц ({DONATE_EXPENSES_PERIOD}): всего{" "}
            <span className="font-mono text-text-0">{formatRub(total)}</span>.
          </>
        ) : (
          <>
            Статьи расходов такие. Суммы мы публикуем, когда сверим их с
            выписками, — выдуманных цифр здесь не будет.
          </>
        )}
        {hasAmounts && unknownCount > 0 && (
          <>
            {" "}
            Ещё {unknownCount} стат{unknownCount === 1 ? "ья" : "ьи"} без суммы —
            доли считаются от того, что известно.
          </>
        )}
      </p>

      <ul className="mt-4 space-y-3">
        {rows.map((row) => (
          <li key={row.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-sm font-medium text-text-0">{row.title}</span>
              <span className="font-mono text-sm text-text-1">
                {row.amountRub === null ? (
                  "уточняется"
                ) : (
                  <>
                    {formatRub(row.amountRub)}
                    {row.share !== null && (
                      <span className="text-text-2"> · {row.share}%</span>
                    )}
                  </>
                )}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-text-1">{row.note}</p>
            {row.share !== null && (
              <div
                aria-hidden
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-2"
              >
                <div
                  className="h-full rounded-full bg-magenta"
                  style={{ width: `${row.share}%` }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
