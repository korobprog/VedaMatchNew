"use client";

import Link from "next/link";
import {
  AGE_STORAGE_KEY,
  emptyStateActions,
  EVERYTHING_URL,
  withIncludeSwiped,
} from "./recommendation-empty-state";

/**
 * Пустая выдача. Вместо разбора всех возможных причин текстом показываем
 * ровно те действия, которые в этом состоянии действительно изменят
 * результат — какая причина сработала, страница определяет сама.
 */
export function RecommendationsEmpty({
  params,
  narrowingFilterCount,
  includeSwiped,
  viewedMatchCount,
}: {
  params: Record<string, string | string[] | undefined>;
  narrowingFilterCount: number;
  includeSwiped: boolean;
  viewedMatchCount: number;
}) {
  const { viewedToShow, canResetFilters, nothingHelps } = emptyStateActions({
    narrowingFilterCount,
    includeSwiped,
    viewedMatchCount,
  });

  return (
    <div className="glass rounded-3xl border border-glass-brd p-10 text-center">
      <p className="text-sm text-text-1">
        {nothingHelps
          ? "Вы посмотрели всех, кто сейчас подходит. Новые анкеты появятся — загляните позже."
          : "Сейчас подходящих анкет нет."}
      </p>

      {(viewedToShow !== null || canResetFilters) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {viewedToShow !== null && (
            <Link
              href={withIncludeSwiped(params)}
              className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-5 py-2.5 text-sm font-semibold text-white transition hover:shadow-[0_0_20px_var(--vm-glow-magenta)]"
            >
              Показать уже отсмотренных ({viewedToShow})
            </Link>
          )}
          {canResetFilters && (
            <a
              href="/union/recommendations"
              onClick={() => {
                // Иначе сохранённый возрастной фильтр молча вернётся и
                // «Сбросить» не будет ощущаться сброшенным.
                try {
                  window.localStorage.removeItem(AGE_STORAGE_KEY);
                } catch {
                  // localStorage недоступен (приватный режим) — не критично.
                }
              }}
              className="rounded-xl glass border border-glass-brd px-5 py-2.5 text-sm font-medium text-text-1 transition hover:text-text-0"
            >
              Сбросить фильтры
            </a>
          )}
          {/* Сброс фильтров не снимает историю показов, а «показать
              отсмотренных» сохраняет фильтры. Когда пусто из-за обоих сразу,
              ни одна из тех кнопок до людей не доводит — это последний выход. */}
          {canResetFilters && (
            <a
              href={EVERYTHING_URL}
              onClick={() => {
                // Тот же капкан, что у «Сбросить фильтры»: сохранённый возраст
                // молча вернулся бы и снова сузил выдачу.
                try {
                  window.localStorage.removeItem(AGE_STORAGE_KEY);
                } catch {
                  // localStorage недоступен (приватный режим) — не критично.
                }
              }}
              className="text-sm font-medium text-text-2 underline-offset-4 transition hover:text-text-0 hover:underline"
            >
              Показать вообще всех
            </a>
          )}
        </div>
      )}
    </div>
  );
}
