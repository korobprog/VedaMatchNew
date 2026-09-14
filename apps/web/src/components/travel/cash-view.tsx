"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import {
  TRAVEL_CASH_GROUPINGS,
  type TravelCashCategoryDto,
  type TravelCashEntriesResponse,
  type TravelCashGrouping,
} from "@vedamatch/shared";
import { getCashCategories, getCashEntries } from "@/lib/travel-api";
import { CashCategoriesDialog } from "./cash-categories-dialog";
import { CashEntryDialog, type CashEntryDraft } from "./cash-entry-dialog";
import { cashRangeFor, groupCashEntries, localToday } from "./cash-grouping";
import { CashIcon } from "./cash-icons";
import { formatBalance, formatSigned } from "./cash-money";

const GROUPING_LABELS: Record<TravelCashGrouping, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
  year: "Год",
};

/**
 * Касса объекта: лента доходов и расходов по периодам с остатком на начало и
 * конец каждого. Устроена как кассовая книга хостела: сверху новое, в шапке
 * дня — сколько было, сколько пришло и ушло, сколько стало.
 */
export function CashView({ stayId }: { stayId: string }) {
  const [grouping, setGrouping] = useState<TravelCashGrouping>("day");
  const [pages, setPages] = useState(1);
  const [data, setData] = useState<TravelCashEntriesResponse | null>(null);
  const [categories, setCategories] = useState<TravelCashCategoryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Ключ последнего завершённого запроса: пока он не совпал с текущим — грузим. */
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<CashEntryDraft | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);

  const range = useMemo(
    () => cashRangeFor(grouping, localToday(), pages),
    [grouping, pages],
  );

  const requestKey = `${stayId}|${range.from}|${range.to}|${reloadKey}`;
  const loading = settledKey !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      getCashEntries(stayId, range, controller.signal),
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
          cause instanceof Error ? cause.message : "Касса не загрузилась",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettledKey(requestKey);
      });
    return () => controller.abort();
  }, [stayId, range, requestKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  const groups = useMemo(
    () =>
      data
        ? groupCashEntries(data.items, grouping, data.balanceBeforeMinor)
        : [],
    [data, grouping],
  );

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  function toggleGroup(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function changeGrouping(next: TravelCashGrouping) {
    setGrouping(next);
    setPages(1);
    setCollapsed(new Set());
  }

  const currency = data?.currency ?? "rub";

  return (
    <div className="space-y-5 pb-24">
      <header className="space-y-3">
        <div>
          <p className="text-sm text-text-2">
            <Link
              href={`/travel/manage/${stayId}/bookings`}
              className="underline-offset-4 hover:underline"
            >
              {data?.stayName ?? "Объект"}
            </Link>
          </p>
          <h1 className="font-display text-2xl text-text-0">Касса</h1>
        </div>

        <div className="rounded-2xl border border-glass-brd bg-glass p-4">
          <p className="text-sm text-text-2">Остаток в кассе</p>
          <p className="font-mono text-3xl font-bold text-text-0">
            {data ? formatBalance(data.balanceMinor, currency) : "—"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDraft({ kind: "income", entry: null })}
            className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold"
          >
            + Доход
          </button>
          <button
            type="button"
            onClick={() => setDraft({ kind: "expense", entry: null })}
            className="rounded-xl border border-magenta px-4 py-2 text-sm font-semibold text-text-0"
          >
            − Расход
          </button>
          <button
            type="button"
            onClick={() => setCategoriesOpen(true)}
            className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1"
          >
            Статьи и остаток
          </button>
        </div>

        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Группировать по</legend>
          {TRAVEL_CASH_GROUPINGS.map((value) => (
            <label
              key={value}
              className={`cursor-pointer rounded-xl border px-3 py-1.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-magenta ${
                grouping === value
                  ? "border-magenta text-text-0"
                  : "border-glass-brd text-text-1"
              }`}
            >
              <input
                type="radio"
                name="cash-grouping"
                value={value}
                checked={grouping === value}
                onChange={() => changeGrouping(value)}
                className="sr-only"
              />
              {GROUPING_LABELS[value]}
            </label>
          ))}
        </fieldset>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      ) : null}

      {!data && loading ? (
        <p className="text-sm text-text-2">Загружаем кассу…</p>
      ) : groups.length === 0 && data ? (
        <p className="rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
          За этот период записей нет. Внесите первый доход или расход — остаток
          посчитается сам.
        </p>
      ) : (
        <div className="space-y-3" aria-busy={loading}>
          {groups.map((group) => {
            const open = !collapsed.has(group.key);
            const net = group.incomeMinor - group.expenseMinor;
            const panelId = `cash-group-${group.key}`;
            return (
              <section
                key={group.key}
                aria-labelledby={`${panelId}-title`}
                className="overflow-hidden rounded-2xl border border-glass-brd bg-glass"
              >
                <h2 id={`${panelId}-title`} className="m-0">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    aria-expanded={open}
                    aria-controls={panelId}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-base text-text-0 first-letter:uppercase">
                        {group.label}
                      </span>
                      <span className="mt-1 block font-mono text-sm text-text-1">
                        {formatBalance(group.startMinor, currency)}{" "}
                        {formatSigned(net, currency) || "±0"} ={" "}
                        <span className="font-semibold text-text-0">
                          {formatBalance(group.endMinor, currency)}
                        </span>
                      </span>
                      <span className="mt-0.5 block font-mono text-xs text-text-2">
                        доход {formatSigned(group.incomeMinor, currency)} ·
                        расход {formatSigned(-group.expenseMinor, currency)}
                      </span>
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className={`mt-1 size-5 shrink-0 text-text-2 transition-transform motion-reduce:transition-none ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </h2>
                <ul
                  id={panelId}
                  hidden={!open}
                  className="divide-y divide-glass-brd border-t border-glass-brd"
                >
                  {group.entries.map((entry) => {
                    const category = entry.categoryId
                      ? categoryById.get(entry.categoryId)
                      : undefined;
                    const signed =
                      entry.kind === "income"
                        ? entry.amountMinor
                        : -entry.amountMinor;
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          onClick={() => setDraft({ kind: entry.kind, entry })}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-1"
                        >
                          <CashIcon
                            icon={category?.icon}
                            className="size-6 shrink-0 text-text-1"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-text-0">
                              {category?.name ?? "Без статьи"}
                            </span>
                            {entry.note ? (
                              <span className="block truncate text-sm text-text-1">
                                {entry.note}
                              </span>
                            ) : null}
                            {entry.tags.length ? (
                              <span className="block truncate text-xs text-text-2">
                                {entry.tags.map((tag) => `#${tag}`).join(" ")}
                              </span>
                            ) : null}
                          </span>
                          {/* Цвет суммы — только крупным жирным кеглем: мелким
                              текстом cyan и magenta не держат контраст на
                              светлой теме. Знак дублирует цвет. */}
                          <span
                            className={`shrink-0 font-mono text-[1.1875rem] font-bold ${
                              entry.kind === "income"
                                ? "text-cyan"
                                : "text-magenta"
                            }`}
                          >
                            {formatSigned(signed, currency)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {data ? (
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={() => setPages((count) => count + 1)}
            disabled={loading}
            className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 disabled:opacity-50"
          >
            {loading ? "Загружаем…" : "Показать раньше"}
          </button>
          <p className="text-xs text-text-2">
            Показано с {data.from} по {data.to}
          </p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setDraft({ kind: "income", entry: null })}
        aria-label="Добавить запись в кассу"
        className="btn-mint fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-20 flex size-14 items-center justify-center rounded-2xl shadow-lg"
      >
        <Plus aria-hidden="true" className="size-7" />
      </button>

      <CashEntryDialog
        stayId={stayId}
        currency={currency}
        categories={categories}
        draft={draft}
        onClose={() => setDraft(null)}
        onSaved={() => {
          setDraft(null);
          reload();
        }}
      />
      <CashCategoriesDialog
        open={categoriesOpen}
        stayId={stayId}
        currency={currency}
        categories={categories}
        openingMinor={data?.openingMinor ?? 0}
        onClose={() => setCategoriesOpen(false)}
        onChanged={reload}
      />
    </div>
  );
}
