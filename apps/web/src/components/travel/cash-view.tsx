"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import {
  TRAVEL_CASH_GROUPINGS,
  type TravelCashCategoryDto,
  type TravelCashEntriesResponse,
  type TravelCashEntryDto,
  type TravelCashFilters,
  type TravelCashGrouping,
  type TravelCashKind,
  type TravelCashTemplateDto,
  type TravelGuestDto,
} from "@vedamatch/shared";
import {
  createCashTemplate,
  getCashCategories,
  getCashEntries,
  getCashTemplates,
  getGuests,
  removeCashEntries,
  removeCashEntry,
} from "@/lib/travel-api";
import {
  CashActionPanel,
  CashPanelSettingsDialog,
  useCashPanelSettings,
} from "./cash-action-panel";
import { CashCategoriesDialog } from "./cash-categories-dialog";
import { cashHotkey } from "./cash-panel";
import { CashEntryActions, type CashEntryAction } from "./cash-entry-actions";
import { CashEntryDialog, type CashEntryDraft } from "./cash-entry-dialog";
import { CashFiltersPanel } from "./cash-filters-panel";
import { cashRangeFor, groupCashEntries, localToday } from "./cash-grouping";
import { CashIcon } from "./cash-icons";
import { formatBalance, formatSigned } from "./cash-money";
import {
  duplicateOf,
  filterChips,
  filtersToQuery,
  selectionTotals,
  templateOf,
  withoutFilter,
} from "./cash-tools";
import { GUEST_BORDER_CLASS } from "./guest-format";

const GROUPING_LABELS: Record<TravelCashGrouping, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
  year: "Год",
};

/** Ключ последнего открытого объекта — туда ведёт ярлык «Касса» приложения. */
export const LAST_CASH_STAY_KEY = "vm.travel.cash.lastStay";

/**
 * Касса объекта: лента доходов и расходов по периодам с остатком на начало и
 * конец каждого. Устроена как кассовая книга хостела: сверху новое, в шапке
 * дня — сколько было, сколько пришло и ушло, сколько стало.
 */
export function CashView({
  stayId,
  initialAdd,
}: {
  stayId: string;
  /** Открыть форму сразу — так кассу открывает ярлык приложения. */
  initialAdd?: TravelCashKind;
}) {
  const router = useRouter();
  const [panel, setPanel] = useCashPanelSettings();
  const [panelSettingsOpen, setPanelSettingsOpen] = useState(false);
  const [grouping, setGrouping] = useState<TravelCashGrouping>("day");
  const [pages, setPages] = useState(1);
  const [filters, setFilters] = useState<TravelCashFilters>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [data, setData] = useState<TravelCashEntriesResponse | null>(null);
  const [categories, setCategories] = useState<TravelCashCategoryDto[]>([]);
  const [guests, setGuests] = useState<TravelGuestDto[]>([]);
  const [templates, setTemplates] = useState<TravelCashTemplateDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Ключ последнего завершённого запроса: пока он не совпал с текущим — грузим. */
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<CashEntryDraft | null>(() =>
    initialAdd ? { kind: initialAdd, entry: null } : null,
  );
  const [actionEntry, setActionEntry] = useState<TravelCashEntryDto | null>(
    null,
  );
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);

  const range = useMemo(
    () => cashRangeFor(grouping, localToday(), pages),
    [grouping, pages],
  );
  const filterQuery = useMemo(() => filtersToQuery(filters), [filters]);

  const requestKey = `${stayId}|${range.from}|${range.to}|${JSON.stringify(filterQuery)}|${reloadKey}`;
  const loading = settledKey !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      getCashEntries(stayId, { ...filterQuery, ...range }, controller.signal),
      getCashCategories(stayId, controller.signal),
      getGuests(stayId, controller.signal),
      getCashTemplates(stayId, controller.signal),
    ])
      .then(([entries, cats, base, tpl]) => {
        setData(entries);
        setCategories(cats.items);
        setGuests(base.items);
        setTemplates(tpl.items);
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
  }, [stayId, range, filterQuery, requestKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  // Ярлык приложения ведёт на последнюю открытую кассу. Параметр `?add=`
  // убираем из адреса: обновление страницы не должно снова открывать форму.
  useEffect(() => {
    try {
      window.localStorage.setItem(LAST_CASH_STAY_KEY, stayId);
    } catch {
      // Приватный режим — ярлык просто предложит выбрать объект.
    }
    if (initialAdd) {
      router.replace(`/travel/manage/${stayId}/cash`, { scroll: false });
    }
  }, [stayId, initialAdd, router]);

  // Горячие клавиши: «+» доход, «-» расход, «/» фильтр, «S» статистика.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editing = Boolean(
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)),
      );
      const action = cashHotkey({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        editing,
        dialogOpen: Boolean(document.querySelector("dialog[open]")),
      });
      if (!action) return;
      event.preventDefault();
      if (action === "income" || action === "expense") {
        setDraft({ kind: action, entry: null });
      } else if (action === "filter") {
        setFiltersOpen(true);
      } else {
        router.push(`/travel/manage/${stayId}/cash/stats`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, stayId]);

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

  const currency = data?.currency ?? "rub";
  const filtered = data?.filtered ?? false;
  const chips = filterChips(filters, categories, guests, currency);
  const totals = selectionTotals(data?.items ?? [], selected);

  const panelHandlers = {
    stayId,
    kindFilter: filters.kind,
    filterCount: chips.length,
    filtersOpen,
    onAdd: (kind: TravelCashKind) => setDraft({ kind, entry: null }),
    // «Доходы» и «Расходы» — быстрый фильтр по виду; повторное нажатие снимает.
    onToggleKind: (kind: TravelCashKind) =>
      applyFilters(
        filters.kind === kind
          ? withoutFilter(filters, "kind")
          : { ...filters, kind },
      ),
    onCategories: () => setCategoriesOpen(true),
    onToggleFilters: () => setFiltersOpen((open) => !open),
  };

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

  function applyFilters(next: TravelCashFilters) {
    setFilters(next);
    setFiltersOpen(false);
    setSelected(new Set());
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  async function onAction(action: CashEntryAction, entry: TravelCashEntryDto) {
    setActionEntry(null);
    setNotice(null);
    setError(null);
    switch (action) {
      case "edit":
        setDraft({ kind: entry.kind, entry });
        return;
      case "duplicate":
        setDraft({
          kind: entry.kind,
          entry: null,
          prefill: duplicateOf(entry, localToday()),
        });
        return;
      case "template": {
        const suggestion = entry.categoryId
          ? (categoryById.get(entry.categoryId)?.name ?? "")
          : "";
        const name = window.prompt("Название шаблона", suggestion);
        if (!name?.trim()) return;
        try {
          await createCashTemplate(stayId, templateOf(entry, name));
          setNotice(`Шаблон «${name.trim()}» сохранён — он появится в форме`);
          reload();
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : "Шаблон не сохранился",
          );
        }
        return;
      }
      case "filter-category":
        if (entry.categoryId) applyFilters({ categoryId: entry.categoryId });
        return;
      case "filter-guest":
        if (entry.guestId) applyFilters({ guestId: entry.guestId });
        return;
      case "select":
        setSelecting(true);
        setSelected(new Set([entry.id]));
        return;
      case "delete":
        if (!window.confirm("Удалить запись? Остатки пересчитаются.")) return;
        try {
          await removeCashEntry(stayId, entry.id);
          reload();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Не удалилось");
        }
        return;
    }
  }

  async function removeSelected() {
    if (totals.count === 0) return;
    if (
      !window.confirm(
        `Удалить выбранные записи (${totals.count})? Остатки пересчитаются.`,
      )
    ) {
      return;
    }
    try {
      const { removed } = await removeCashEntries(stayId, [...selected]);
      setNotice(`Удалено записей: ${removed}`);
      stopSelecting();
      reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалилось");
    }
  }

  return (
    <div className="space-y-5 pb-28">
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

        {panel.position === "top" ? (
          <CashActionPanel
            settings={panel}
            onSettings={() => setPanelSettingsOpen(true)}
            handlers={panelHandlers}
          />
        ) : null}

        {filtersOpen ? (
          <div id="cash-filters">
            <CashFiltersPanel
              key={JSON.stringify(filterQuery)}
              filters={filters}
              categories={categories}
              guests={guests}
              onApply={applyFilters}
            />
          </div>
        ) : null}

        {chips.length ? (
          <ul className="flex flex-wrap gap-2" aria-label="Активные фильтры">
            {chips.map((chip) => (
              <li key={chip.key}>
                <button
                  type="button"
                  onClick={() => applyFilters(withoutFilter(filters, chip.key))}
                  className="flex items-center gap-1 rounded-xl border border-magenta px-2.5 py-1 text-sm text-text-0"
                >
                  {chip.label}
                  <X aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">— снять фильтр</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

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
      {notice ? (
        <p role="status" className="text-sm text-text-1">
          {notice}
        </p>
      ) : null}
      {filtered ? (
        <p className="text-sm text-text-2">
          Показаны отобранные записи — остатки по периодам не считаются.
        </p>
      ) : null}

      {!data && loading ? (
        <p className="text-sm text-text-2">Загружаем кассу…</p>
      ) : groups.length === 0 && data ? (
        <p className="rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
          {filtered
            ? "Под фильтр ничего не попало."
            : "За этот период записей нет. Внесите первый доход или расход — остаток посчитается сам."}
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
                      {filtered ? (
                        <span className="mt-1 block font-mono text-sm text-text-1">
                          итог {formatSigned(net, currency)}
                        </span>
                      ) : (
                        <span className="mt-1 block font-mono text-sm text-text-1">
                          {formatBalance(group.startMinor, currency)}{" "}
                          {formatSigned(net, currency)} ={" "}
                          <span className="font-semibold text-text-0">
                            {formatBalance(group.endMinor, currency)}
                          </span>
                        </span>
                      )}
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
                  {group.entries.map((entry) => (
                    <li key={entry.id}>
                      <EntryRow
                        entry={entry}
                        category={
                          entry.categoryId
                            ? categoryById.get(entry.categoryId)
                            : undefined
                        }
                        currency={currency}
                        selecting={selecting}
                        checked={selected.has(entry.id)}
                        onOpen={() => setActionEntry(entry)}
                        onToggle={() => toggleSelected(entry.id)}
                      />
                    </li>
                  ))}
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

      {selecting ? (
        <div
          role="region"
          aria-label="Выбранные записи"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-glass-brd bg-bg-0 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        >
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 font-mono text-sm text-text-0">
              Выбрано {totals.count}
              {totals.incomeMinor
                ? ` · ${formatSigned(totals.incomeMinor, currency)}`
                : ""}
              {totals.expenseMinor
                ? ` · ${formatSigned(-totals.expenseMinor, currency)}`
                : ""}
            </p>
            <button
              type="button"
              onClick={() => void removeSelected()}
              disabled={totals.count === 0}
              className="rounded-xl border border-magenta px-4 py-2 text-sm text-text-0 disabled:opacity-50"
            >
              Удалить
            </button>
            <button
              type="button"
              onClick={stopSelecting}
              className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1"
            >
              Готово
            </button>
          </div>
        </div>
      ) : panel.position === "bottom" ? (
        <CashActionPanel
          settings={panel}
          onSettings={() => setPanelSettingsOpen(true)}
          handlers={panelHandlers}
          className="fixed inset-x-0 bottom-0 z-20 overflow-x-auto border-t border-glass-brd bg-bg-0 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] [&>ul]:mx-auto [&>ul]:max-w-3xl [&>ul]:flex-nowrap"
        />
      ) : (
        <button
          type="button"
          onClick={() => setDraft({ kind: "income", entry: null })}
          aria-label="Добавить запись в кассу"
          aria-keyshortcuts="+"
          className="btn-mint fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-20 flex size-14 items-center justify-center rounded-2xl shadow-lg"
        >
          <Plus aria-hidden="true" className="size-7" />
        </button>
      )}

      <CashPanelSettingsDialog
        open={panelSettingsOpen}
        settings={panel}
        onChange={setPanel}
        onClose={() => setPanelSettingsOpen(false)}
      />

      <CashEntryActions
        entry={actionEntry}
        category={
          actionEntry?.categoryId
            ? categoryById.get(actionEntry.categoryId)
            : undefined
        }
        currency={currency}
        onAction={(action, entry) => void onAction(action, entry)}
        onClose={() => setActionEntry(null)}
      />
      <CashEntryDialog
        stayId={stayId}
        currency={currency}
        categories={categories}
        guests={guests}
        templates={templates}
        nightPriceMinor={data?.nightPriceMinor ?? null}
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
        templates={templates}
        openingMinor={data?.openingMinor ?? 0}
        onClose={() => setCategoriesOpen(false)}
        onChanged={reload}
      />
    </div>
  );
}

function EntryRow({
  entry,
  category,
  currency,
  selecting,
  checked,
  onOpen,
  onToggle,
}: {
  entry: TravelCashEntryDto;
  category: TravelCashCategoryDto | undefined;
  currency: TravelCashEntriesResponse["currency"];
  selecting: boolean;
  checked: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const signed =
    entry.kind === "income" ? entry.amountMinor : -entry.amountMinor;
  const body = (
    <>
      <CashIcon icon={category?.icon} className="size-6 shrink-0 text-text-1" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-text-0">
          {category?.name ?? "Без статьи"}
        </span>
        {entry.guestName ? (
          // Гость — в рамке его цвета, как в кассовой книге хостела; сутки —
          // индексом у рамки.
          <span className="mt-0.5 flex items-start gap-1">
            <span
              className={`max-w-full truncate rounded-lg border-2 px-2 py-0.5 text-sm text-text-0 ${GUEST_BORDER_CLASS[entry.guestColor ?? "none"]}`}
            >
              {entry.guestName}
            </span>
            {entry.nights ? (
              <span className="font-mono text-xs text-text-1">
                <span className="sr-only">, суток: </span>
                {entry.nights}
              </span>
            ) : null}
          </span>
        ) : null}
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
      {/* Цвет суммы — только крупным жирным кеглем: мелким текстом cyan и
          magenta не держат контраст на светлой теме. Знак дублирует цвет. */}
      <span
        className={`shrink-0 font-mono text-[1.1875rem] font-bold ${
          entry.kind === "income" ? "text-cyan" : "text-magenta"
        }`}
      >
        {formatSigned(signed, currency)}
      </span>
    </>
  );

  if (selecting) {
    return (
      <label className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-magenta">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="size-5 shrink-0 accent-[var(--vm-magenta)]"
        />
        {body}
      </label>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-1"
    >
      {body}
    </button>
  );
}
