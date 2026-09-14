"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  TRAVEL_CASH_ICONS,
  TRAVEL_CURRENCY_SIGNS,
  type TravelCashCategoryDto,
  type TravelCashIcon,
  type TravelCashKind,
  type TravelCurrency,
} from "@vedamatch/shared";
import {
  createCashCategory,
  removeCashCategory,
  setCashOpening,
  updateCashCategory,
} from "@/lib/travel-api";
import { CASH_ICONS, CashIcon } from "./cash-icons";
import { moneyInputValue, parseSignedMoneyInput } from "./cash-money";

const fieldClass =
  "rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";

const KIND_TITLES: Record<TravelCashKind, string> = {
  income: "Доходы",
  expense: "Расходы",
};

/** Выбор значка: список, а не сетка картинок без подписей — её не прочесть скринридером. */
function IconSelect({
  value,
  onChange,
  label,
}: {
  value: TravelCashIcon;
  onChange: (icon: TravelCashIcon) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2">
      <CashIcon icon={value} className="size-5 shrink-0 text-text-1" />
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as TravelCashIcon)}
        className={fieldClass}
      >
        {TRAVEL_CASH_ICONS.map((icon) => (
          <option key={icon} value={icon}>
            {CASH_ICONS[icon].label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CategoryRow({
  stayId,
  category,
  onChanged,
  onError,
}: {
  stayId: string;
  category: TravelCashCategoryDto;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState(category.icon);
  const dirty = name.trim() !== category.name || icon !== category.icon;

  async function save() {
    try {
      await updateCashCategory(stayId, category.id, { name, icon });
      onChanged();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Не сохранилось");
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Удалить статью «${category.name}»? Записи останутся, но без статьи.`,
      )
    ) {
      return;
    }
    try {
      await removeCashCategory(stayId, category.id);
      onChanged();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Не удалилось");
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-2">
      <IconSelect
        value={icon}
        onChange={setIcon}
        label={`Значок статьи «${category.name}»`}
      />
      <label className="min-w-0 flex-1">
        <span className="sr-only">Название статьи</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          className={`${fieldClass} w-full`}
        />
      </label>
      {dirty ? (
        <button
          type="button"
          onClick={() => void save()}
          className="rounded-xl border border-magenta px-3 py-2 text-sm text-text-0"
        >
          Сохранить
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => void remove()}
        className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1"
      >
        Удалить
      </button>
    </li>
  );
}

interface PanelProps {
  stayId: string;
  currency: TravelCurrency;
  categories: TravelCashCategoryDto[];
  openingMinor: number;
  onChanged: () => void;
}

/**
 * Справочник статей и начальный остаток. Раз в жизни кассы, поэтому в
 * диалоге, а не на главном экране: там место ленте.
 *
 * Содержимое монтируется на каждое открытие — поле остатка заполняется
 * инициализатором состояния, а не эффектом.
 */
export function CashCategoriesDialog({
  open,
  onClose,
  ...panel
}: PanelProps & { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="cash-categories-title"
      onClose={onClose}
      className="m-auto max-h-[90vh] w-[min(94vw,36rem)] overflow-y-auto rounded-3xl border border-glass-brd bg-bg-0 p-0 text-text-0 backdrop:bg-black/60"
    >
      {open ? (
        <CategoriesPanel
          {...panel}
          onCloseClick={() => dialogRef.current?.close()}
        />
      ) : null}
    </dialog>
  );
}

function CategoriesPanel({
  stayId,
  currency,
  categories,
  openingMinor,
  onChanged,
  onCloseClick,
}: PanelProps & { onCloseClick: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [newKind, setNewKind] = useState<TravelCashKind>("expense");
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState<TravelCashIcon>("other");
  const [opening, setOpening] = useState(moneyInputValue(openingMinor));

  async function addCategory(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await createCashCategory(stayId, {
        kind: newKind,
        name: newName,
        icon: newIcon,
      });
      setNewName("");
      setNewIcon("other");
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Статья не добавилась");
    }
  }

  async function saveOpening(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const minor = parseSignedMoneyInput(opening);
    if (minor === null) {
      setError("Начальный остаток — число, копейки через запятую");
      return;
    }
    try {
      await setCashOpening(stayId, minor);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не сохранилось");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <h2
          id="cash-categories-title"
          className="font-display text-lg font-bold"
        >
          Статьи и остаток
        </h2>
        <button
          type="button"
          onClick={onCloseClick}
          className="rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-1"
        >
          Закрыть
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      ) : null}

      <form onSubmit={(event) => void saveOpening(event)} className="space-y-1">
        <label htmlFor="cash-opening" className="block text-sm text-text-1">
          Остаток на момент начала учёта, {TRAVEL_CURRENCY_SIGNS[currency]}
        </label>
        <div className="flex gap-2">
          <input
            id="cash-opening"
            value={opening}
            onChange={(event) => setOpening(event.target.value)}
            inputMode="decimal"
            className={`${fieldClass} flex-1 font-mono`}
          />
          <button
            type="submit"
            className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1"
          >
            Сохранить
          </button>
        </div>
        <p className="text-xs text-text-2">
          Сколько денег было в кассе до первой записи. Долг — со знаком минус.
        </p>
      </form>

      {(["income", "expense"] as const).map((kind) => (
        <section key={kind} aria-labelledby={`cash-kind-${kind}`}>
          <h3
            id={`cash-kind-${kind}`}
            className="font-display text-base text-text-0"
          >
            {KIND_TITLES[kind]}
          </h3>
          <ul className="mt-2 space-y-2">
            {categories
              .filter((category) => category.kind === kind)
              .map((category) => (
                <CategoryRow
                  // Ключ с названием и значком: после сохранения строка
                  // перерисуется с новыми значениями, а не со старым вводом.
                  key={`${category.id}:${category.name}:${category.icon}`}
                  stayId={stayId}
                  category={category}
                  onChanged={onChanged}
                  onError={setError}
                />
              ))}
          </ul>
        </section>
      ))}

      <form
        onSubmit={(event) => void addCategory(event)}
        className="space-y-2 rounded-2xl border border-glass-brd p-4"
      >
        <h3 className="font-display text-base text-text-0">Новая статья</h3>
        <div className="flex flex-wrap items-center gap-2">
          <label>
            <span className="sr-only">Вид статьи</span>
            <select
              value={newKind}
              onChange={(event) =>
                setNewKind(event.target.value as TravelCashKind)
              }
              className={fieldClass}
            >
              <option value="income">Доход</option>
              <option value="expense">Расход</option>
            </select>
          </label>
          <IconSelect
            value={newIcon}
            onChange={setNewIcon}
            label="Значок новой статьи"
          />
          <label className="min-w-0 flex-1">
            <span className="sr-only">Название новой статьи</span>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={40}
              required
              placeholder="Название"
              className={`${fieldClass} w-full`}
            />
          </label>
          <button
            type="submit"
            className="rounded-xl border border-magenta px-3 py-2 text-sm text-text-0"
          >
            Добавить
          </button>
        </div>
      </form>
    </div>
  );
}
