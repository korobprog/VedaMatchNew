"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  TravelCashCategoryDto,
  TravelCashEntriesResponse,
  TravelCashKind,
  TravelCurrency,
} from "@vedamatch/shared";
import { getCashCategories, getCashEntries } from "@/lib/travel-api";
import { localToday } from "./cash-grouping";
import { CashIcon } from "./cash-icons";
import { formatBalance, formatSigned } from "./cash-money";
import {
  CASH_STATS_PRESET_LABELS,
  CASH_STATS_PRESETS,
  categoryTotals,
  niceMax,
  periodTotals,
  statsRange,
  totalsOf,
  type CashStatsPreset,
  type PeriodTotal,
} from "./cash-stats";
import { formatPrice } from "./price";

const SERIES: Record<TravelCashKind, { label: string; swatch: string }> = {
  income: { label: "Доход", swatch: "bg-chart-income" },
  expense: { label: "Расход", swatch: "bg-chart-expense" },
};

/**
 * Статистика кассы: доход и расход за период, по периодам и по статьям.
 * Одна ось, два ряда; цвета — токены графика, проверенные на различимость;
 * значения — цветом текста, а не цветом ряда.
 */
export function CashStatsView({ stayId }: { stayId: string }) {
  const [preset, setPreset] = useState<CashStatsPreset>("month");
  const [data, setData] = useState<TravelCashEntriesResponse | null>(null);
  const [categories, setCategories] = useState<TravelCashCategoryDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => statsRange(preset, localToday()), [preset]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      getCashEntries(
        stayId,
        { from: range.from, to: range.to },
        controller.signal,
      ),
      getCashCategories(stayId, controller.signal),
    ])
      .then(([entries, cats]) => {
        setData(entries);
        setCategories(cats.items);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : "Статистика не загрузилась",
        );
      });
    return () => controller.abort();
  }, [stayId, range]);

  const entries = useMemo(() => data?.items ?? [], [data]);
  const currency = data?.currency ?? "rub";
  const totals = useMemo(() => totalsOf(entries), [entries]);
  const periods = useMemo(
    () => periodTotals(entries, range.grouping, range.from, range.to),
    [entries, range],
  );

  return (
    <div className="space-y-6 pb-10">
      <header className="space-y-3">
        <div>
          <p className="text-sm text-text-2">
            <Link
              href={`/travel/manage/${stayId}/cash`}
              className="underline-offset-4 hover:underline"
            >
              {data?.stayName ? `${data.stayName} · касса` : "Касса"}
            </Link>
          </p>
          <h1 className="font-display text-2xl text-text-0">Статистика</h1>
        </div>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Период</legend>
          {CASH_STATS_PRESETS.map((value) => (
            <label
              key={value}
              className={`cursor-pointer rounded-xl border px-3 py-1.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-magenta ${
                preset === value
                  ? "border-magenta text-text-0"
                  : "border-glass-brd text-text-1"
              }`}
            >
              <input
                type="radio"
                name="cash-stats-preset"
                value={value}
                checked={preset === value}
                onChange={() => setPreset(value)}
                className="sr-only"
              />
              {CASH_STATS_PRESET_LABELS[value]}
            </label>
          ))}
        </fieldset>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      ) : null}

      {!data ? (
        <p className="text-sm text-text-2">Считаем…</p>
      ) : (
        <>
          {/* На телефоне столбиком: три суммы с копейками в ряд не помещаются. */}
          <dl className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ["Доход", totals.incomeMinor],
                ["Расход", totals.expenseMinor],
                ["Итог", totals.incomeMinor - totals.expenseMinor],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-glass-brd bg-glass p-3"
              >
                <dt className="text-xs text-text-2">{label}</dt>
                <dd className="font-mono text-lg font-bold break-words text-text-0">
                  {label === "Итог"
                    ? formatSigned(value, currency)
                    : formatBalance(value, currency)}
                </dd>
              </div>
            ))}
          </dl>

          <PeriodChart periods={periods} currency={currency} />

          {(["income", "expense"] as const).map((kind) => (
            <CategoryBreakdown
              key={kind}
              kind={kind}
              rows={categoryTotals(entries, categories, kind)}
              currency={currency}
            />
          ))}

          <details className="rounded-2xl border border-glass-brd p-4">
            <summary className="cursor-pointer text-sm text-text-1">
              Таблица по периодам
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-text-2">
                  <tr>
                    <th className="py-1 pr-3 font-normal">Период</th>
                    <th className="py-1 pr-3 text-right font-normal">Доход</th>
                    <th className="py-1 pr-3 text-right font-normal">Расход</th>
                    <th className="py-1 text-right font-normal">Итог</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-text-0">
                  {periods.map((row) => (
                    <tr key={row.key} className="border-t border-glass-brd">
                      <td className="py-1 pr-3 font-body first-letter:uppercase">
                        {row.label}
                      </td>
                      <td className="py-1 pr-3 text-right">
                        {formatPrice(row.incomeMinor, currency)}
                      </td>
                      <td className="py-1 pr-3 text-right">
                        {formatPrice(row.expenseMinor, currency)}
                      </td>
                      <td className="py-1 text-right">
                        {formatSigned(
                          row.incomeMinor - row.expenseMinor,
                          currency,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-4 text-sm text-text-1" aria-hidden="true">
      {(["income", "expense"] as const).map((kind) => (
        <li key={kind} className="flex items-center gap-1.5">
          <span className={`size-3 rounded-sm ${SERIES[kind].swatch}`} />
          {SERIES[kind].label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Доход и расход по периодам: пары столбцов на одной оси. Подпись оси — одна,
 * у максимума; значения — во всплывающей подсказке по наведению и фокусу и в
 * таблице ниже, а не числом над каждым столбцом.
 */
function PeriodChart({
  periods,
  currency,
}: {
  periods: PeriodTotal[];
  currency: TravelCurrency;
}) {
  const max = niceMax(
    Math.max(0, ...periods.map((p) => Math.max(p.incomeMinor, p.expenseMinor))),
  );
  const labelEvery = Math.max(1, Math.ceil(periods.length / 6));

  return (
    <section aria-labelledby="cash-period-chart" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cash-period-chart" className="font-display text-lg text-text-0">
          По периодам
        </h2>
        <Legend />
      </div>
      <div className="rounded-2xl border border-glass-brd bg-glass p-3">
        <p className="font-mono text-xs text-text-2">
          {formatPrice(max, currency)}
        </p>
        <div
          className="mt-1 flex h-44 items-end gap-1 border-b border-glass-brd"
          role="list"
          aria-label="Доход и расход по периодам"
        >
          {periods.map((period) => (
            <div
              key={period.key}
              role="listitem"
              tabIndex={0}
              aria-label={`${period.label}: доход ${formatPrice(period.incomeMinor, currency)}, расход ${formatPrice(period.expenseMinor, currency)}`}
              className="group relative flex h-full min-w-0 flex-1 items-end justify-center gap-0.5 rounded-t focus-visible:outline-2 focus-visible:outline-magenta"
            >
              {(["income", "expense"] as const).map((kind) => {
                const value =
                  kind === "income" ? period.incomeMinor : period.expenseMinor;
                return (
                  <span
                    key={kind}
                    aria-hidden="true"
                    className={`w-full max-w-3 rounded-t ${SERIES[kind].swatch}`}
                    style={{
                      height: value ? `max(2px, ${(value / max) * 100}%)` : 0,
                    }}
                  />
                );
              })}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-max -translate-x-1/2 rounded-lg border border-glass-brd bg-bg-0 px-2 py-1 text-xs text-text-0 shadow group-hover:block group-focus-visible:block"
              >
                <span className="block first-letter:uppercase">
                  {period.label}
                </span>
                <span className="block font-mono">
                  доход {formatPrice(period.incomeMinor, currency)}
                </span>
                <span className="block font-mono">
                  расход {formatPrice(period.expenseMinor, currency)}
                </span>
              </span>
            </div>
          ))}
        </div>
        <div
          className="mt-1 flex gap-1 text-[0.6875rem] text-text-2"
          aria-hidden="true"
        >
          {periods.map((period, index) => (
            <span
              key={period.key}
              className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap"
            >
              {index % labelEvery === 0 ? shortPeriod(period.key) : ""}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Короткая подпись под столбцом: «14», «03.09», «сен». */
function shortPeriod(key: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return `${key.slice(8, 10)}.${key.slice(5, 7)}`;
  }
  if (/^\d{4}-\d{2}$/.test(key)) {
    return new Intl.DateTimeFormat("ru-RU", {
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${key}-01T00:00:00Z`));
  }
  return key;
}

function CategoryBreakdown({
  kind,
  rows,
  currency,
}: {
  kind: TravelCashKind;
  rows: ReturnType<typeof categoryTotals>;
  currency: TravelCurrency;
}) {
  const title = kind === "income" ? "Доходы по статьям" : "Расходы по статьям";
  const top = rows[0]?.amountMinor ?? 0;
  return (
    <section aria-labelledby={`cash-breakdown-${kind}`} className="space-y-2">
      <h2
        id={`cash-breakdown-${kind}`}
        className="font-display text-lg text-text-0"
      >
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-text-2">За период записей нет.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.categoryId ?? "none"}
              className="rounded-2xl border border-glass-brd bg-glass px-3 py-2"
            >
              <div className="flex items-center gap-2 text-sm">
                <CashIcon
                  icon={row.icon}
                  className="size-4 shrink-0 text-text-1"
                />
                <span className="min-w-0 flex-1 truncate text-text-0">
                  {row.name}
                </span>
                <span className="font-mono text-text-0">
                  {formatPrice(row.amountMinor, currency)}
                </span>
                <span className="w-10 text-right font-mono text-xs text-text-2">
                  {Math.round(row.share * 100)}%
                </span>
              </div>
              <div
                className="mt-1.5 h-1.5 rounded-full bg-bg-1"
                aria-hidden="true"
              >
                <div
                  className={`h-full rounded-full ${SERIES[kind].swatch}`}
                  style={{
                    width: `${top ? (row.amountMinor / top) * 100 : 0}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
