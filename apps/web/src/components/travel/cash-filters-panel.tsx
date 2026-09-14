"use client";

import { FormEvent, useState } from "react";
import type {
  TravelCashCategoryDto,
  TravelCashFilters,
  TravelGuestDto,
} from "@vedamatch/shared";
import { moneyInputValue, parseMoneyInput } from "./cash-money";

const fieldClass =
  "mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";

/**
 * Форма фильтра ленты: поиск по имени гостя и заметке, вид, статья, гость,
 * тег и границы суммы. Применяется кнопкой, а не на каждую букву: запрос к
 * кассе за три года на каждое нажатие клавиши никому не нужен.
 */
export function CashFiltersPanel({
  filters,
  categories,
  guests,
  onApply,
}: {
  filters: TravelCashFilters;
  categories: TravelCashCategoryDto[];
  guests: Pick<TravelGuestDto, "id" | "fullName">[];
  onApply: (filters: TravelCashFilters) => void;
}) {
  const [q, setQ] = useState(filters.q ?? "");
  const [kind, setKind] = useState(filters.kind ?? "");
  const [categoryId, setCategoryId] = useState(filters.categoryId ?? "");
  const [guestId, setGuestId] = useState(filters.guestId ?? "");
  const [tag, setTag] = useState(filters.tag ?? "");
  const [min, setMin] = useState(
    filters.minMinor !== undefined ? moneyInputValue(filters.minMinor) : "",
  );
  const [max, setMax] = useState(
    filters.maxMinor !== undefined ? moneyInputValue(filters.maxMinor) : "",
  );
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const minMinor = min.trim() ? parseMoneyInput(min) : undefined;
    const maxMinor = max.trim() ? parseMoneyInput(max) : undefined;
    if (minMinor === null || maxMinor === null) {
      setError("Сумма в фильтре — число, копейки через запятую");
      return;
    }
    if (
      minMinor !== undefined &&
      maxMinor !== undefined &&
      minMinor > maxMinor
    ) {
      setError("«От» больше, чем «до»");
      return;
    }
    setError(null);
    onApply({
      q: q.trim() || undefined,
      kind: kind === "income" || kind === "expense" ? kind : undefined,
      categoryId: categoryId || undefined,
      guestId: guestId || undefined,
      tag: tag.trim().replace(/^#+/, "").toLowerCase() || undefined,
      minMinor,
      maxMinor,
    });
  }

  return (
    <form
      onSubmit={submit}
      className="grid grid-cols-2 gap-3 rounded-2xl border border-glass-brd bg-glass p-4"
    >
      <label className="col-span-2 block text-sm text-text-1">
        Имя гостя или заметка
        <input
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          className={fieldClass}
        />
      </label>
      <label className="block text-sm text-text-1">
        Вид
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          className={fieldClass}
        >
          <option value="">Все</option>
          <option value="income">Доходы</option>
          <option value="expense">Расходы</option>
        </select>
      </label>
      <label className="block text-sm text-text-1">
        Статья
        <select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className={fieldClass}
        >
          <option value="">Все</option>
          <option value="none">Без статьи</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      {guests.length > 0 ? (
        <label className="block text-sm text-text-1">
          Гость
          <select
            value={guestId}
            onChange={(event) => setGuestId(event.target.value)}
            className={fieldClass}
          >
            <option value="">Все</option>
            {guests.map((guest) => (
              <option key={guest.id} value={guest.id}>
                {guest.fullName}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block text-sm text-text-1">
        Тег
        <input
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          placeholder="наличные"
          className={fieldClass}
        />
      </label>
      <label className="block text-sm text-text-1">
        Сумма от
        <input
          value={min}
          onChange={(event) => setMin(event.target.value)}
          inputMode="decimal"
          className={`${fieldClass} font-mono`}
        />
      </label>
      <label className="block text-sm text-text-1">
        Сумма до
        <input
          value={max}
          onChange={(event) => setMax(event.target.value)}
          inputMode="decimal"
          className={`${fieldClass} font-mono`}
        />
      </label>
      {error ? (
        <p role="alert" className="col-span-2 text-sm text-magenta">
          {error}
        </p>
      ) : null}
      <div className="col-span-2 flex flex-wrap gap-2">
        <button
          type="submit"
          className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold"
        >
          Показать
        </button>
        <button
          type="button"
          onClick={() => onApply({})}
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1"
        >
          Сбросить
        </button>
      </div>
    </form>
  );
}
