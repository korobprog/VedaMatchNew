"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { TravelCashKind } from "@vedamatch/shared";
import {
  CASH_HOTKEY_HINTS,
  CASH_PANEL_BUTTON_LABELS,
  CASH_PANEL_BUTTONS,
  CASH_PANEL_STORAGE_KEY,
  parseCashPanel,
  toggleCashPanelButton,
  type CashPanelButton,
  type CashPanelSettings,
} from "./cash-panel";

const CHANGE_EVENT = "vm:cash-panel";

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(CASH_PANEL_STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * Настройка панели из localStorage. Через useSyncExternalStore: сервер
 * рисует панель по умолчанию, браузер сразу берёт сохранённую — без эффекта
 * с setState и без рассинхрона при гидратации.
 */
export function useCashPanelSettings(): [
  CashPanelSettings,
  (next: CashPanelSettings) => void,
] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const save = (next: CashPanelSettings) => {
    try {
      window.localStorage.setItem(CASH_PANEL_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Хранилище закрыто (приватный режим) — панель просто не запомнится.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  return [parseCashPanel(raw), save];
}

export interface CashPanelHandlers {
  stayId: string;
  kindFilter: TravelCashKind | undefined;
  filterCount: number;
  filtersOpen: boolean;
  onAdd: (kind: TravelCashKind) => void;
  onToggleKind: (kind: TravelCashKind) => void;
  onCategories: () => void;
  onToggleFilters: () => void;
}

const base = "rounded-xl border px-3 py-2 text-sm whitespace-nowrap";

/** Кнопки панели в том наборе, что выбрал человек. */
export function CashActionPanel({
  settings,
  onSettings,
  handlers,
  className = "",
}: {
  settings: CashPanelSettings;
  onSettings: () => void;
  handlers: CashPanelHandlers;
  className?: string;
}) {
  const h = handlers;
  const button = (id: CashPanelButton) => {
    switch (id) {
      case "add-income":
        return (
          <button
            type="button"
            onClick={() => h.onAdd("income")}
            aria-keyshortcuts={CASH_HOTKEY_HINTS.income}
            className={`${base} btn-mint border-transparent font-semibold`}
          >
            {CASH_PANEL_BUTTON_LABELS[id]}
          </button>
        );
      case "add-expense":
        return (
          <button
            type="button"
            onClick={() => h.onAdd("expense")}
            aria-keyshortcuts={CASH_HOTKEY_HINTS.expense}
            className={`${base} border-magenta font-semibold text-text-0`}
          >
            {CASH_PANEL_BUTTON_LABELS[id]}
          </button>
        );
      case "incomes":
      case "expenses": {
        const kind = id === "incomes" ? "income" : "expense";
        const active = h.kindFilter === kind;
        return (
          <button
            type="button"
            onClick={() => h.onToggleKind(kind)}
            aria-pressed={active}
            className={`${base} ${active ? "border-magenta text-text-0" : "border-glass-brd text-text-1"}`}
          >
            {CASH_PANEL_BUTTON_LABELS[id]}
          </button>
        );
      }
      case "categories":
        return (
          <button
            type="button"
            onClick={h.onCategories}
            className={`${base} border-glass-brd text-text-1`}
          >
            {CASH_PANEL_BUTTON_LABELS[id]}
          </button>
        );
      case "stats":
        return (
          <Link
            href={`/travel/manage/${h.stayId}/cash/stats`}
            aria-keyshortcuts={CASH_HOTKEY_HINTS.stats}
            className={`${base} inline-block border-glass-brd text-text-1`}
          >
            {CASH_PANEL_BUTTON_LABELS[id]}
          </Link>
        );
      case "filter":
        return (
          <button
            type="button"
            onClick={h.onToggleFilters}
            aria-expanded={h.filtersOpen}
            aria-controls="cash-filters"
            aria-keyshortcuts={CASH_HOTKEY_HINTS.filter}
            className={`${base} border-glass-brd text-text-1`}
          >
            {CASH_PANEL_BUTTON_LABELS[id]}
            {h.filterCount ? ` · ${h.filterCount}` : ""}
          </button>
        );
      case "guests":
        return (
          <Link
            href={`/travel/manage/${h.stayId}/guests`}
            className={`${base} inline-block border-glass-brd text-text-1`}
          >
            {CASH_PANEL_BUTTON_LABELS[id]}
          </Link>
        );
    }
  };

  return (
    <nav aria-label="Действия кассы" className={className}>
      <ul className="flex flex-wrap gap-2">
        {settings.buttons.map((id) => (
          <li key={id}>{button(id)}</li>
        ))}
        <li>
          <button
            type="button"
            onClick={onSettings}
            className={`${base} border-transparent text-text-2 underline-offset-4 hover:underline`}
          >
            Настроить
          </button>
        </li>
      </ul>
    </nav>
  );
}

const HOTKEY_HINT = `Клавиши: ${CASH_HOTKEY_HINTS.income} — доход, ${CASH_HOTKEY_HINTS.expense} — расход, ${CASH_HOTKEY_HINTS.filter} — фильтр, ${CASH_HOTKEY_HINTS.stats} — статистика.`;

/** Где панель и какие на ней кнопки. Меняется сразу, без кнопки «сохранить». */
export function CashPanelSettingsDialog({
  open,
  settings,
  onChange,
  onClose,
}: {
  open: boolean;
  settings: CashPanelSettings;
  onChange: (next: CashPanelSettings) => void;
  onClose: () => void;
}) {
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
      aria-labelledby="cash-panel-settings-title"
      onClose={onClose}
      className="m-auto w-[min(94vw,26rem)] rounded-3xl border border-glass-brd bg-bg-0 p-0 text-text-0 backdrop:bg-black/60"
    >
      <div className="space-y-4 p-6">
        <h2
          id="cash-panel-settings-title"
          className="font-display text-lg font-bold"
        >
          Панель действий
        </h2>

        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="mb-1 text-sm text-text-1">Где панель</legend>
          {(
            [
              ["top", "Сверху"],
              ["bottom", "Снизу"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`cursor-pointer rounded-xl border px-3 py-2 text-center text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-magenta ${
                settings.position === value
                  ? "border-magenta text-text-0"
                  : "border-glass-brd text-text-1"
              }`}
            >
              <input
                type="radio"
                name="cash-panel-position"
                value={value}
                checked={settings.position === value}
                onChange={() => onChange({ ...settings, position: value })}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm text-text-1">Кнопки</legend>
          <ul className="space-y-1">
            {CASH_PANEL_BUTTONS.map((id) => {
              const checked = settings.buttons.includes(id);
              const last = checked && settings.buttons.length === 1;
              return (
                <li key={id}>
                  <label className="flex items-center gap-2 text-sm text-text-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={last}
                      onChange={() =>
                        onChange(toggleCashPanelButton(settings, id))
                      }
                      className="size-4 accent-[var(--vm-magenta)]"
                    />
                    {CASH_PANEL_BUTTON_LABELS[id]}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <p className="text-xs text-text-2">{HOTKEY_HINT}</p>

        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="btn-mint w-full rounded-xl px-4 py-2 text-sm font-semibold"
        >
          Готово
        </button>
      </div>
    </dialog>
  );
}
