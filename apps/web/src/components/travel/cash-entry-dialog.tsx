"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type {
  SaveTravelCashEntryRequest,
  TravelCashTemplateDto,
  TravelCashCategoryDto,
  TravelCashEntryDto,
  TravelCashKind,
  TravelCurrency,
  TravelGuestDto,
} from "@vedamatch/shared";
import { TRAVEL_CURRENCY_SIGNS } from "@vedamatch/shared";
import {
  createCashEntry,
  removeCashEntry,
  updateCashEntry,
} from "@/lib/travel-api";
import { CashIcon } from "./cash-icons";
import { localToday } from "./cash-grouping";
import { moneyInputValue, parseMoneyInput } from "./cash-money";
import { guestPaymentLabel, suggestedAmountMinor } from "./guest-format";
import { templateLabel } from "./cash-tools";

export interface CashEntryDraft {
  kind: TravelCashKind;
  /** Запись, которую правят; null — новая. */
  entry: TravelCashEntryDto | null;
  /** Значения новой записи — у дубля и записи из шаблона. */
  prefill?: SaveTravelCashEntryRequest;
}

interface FormProps {
  stayId: string;
  currency: TravelCurrency;
  categories: TravelCashCategoryDto[];
  /** Клиентская база: живущие сверху, как её отдаёт сервер. */
  guests: TravelGuestDto[];
  nightPriceMinor: number | null;
  templates: TravelCashTemplateDto[];
  draft: CashEntryDraft;
  onCancel: () => void;
  onSaved: () => void;
}

const fieldClass =
  "mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";

/**
 * Форма дохода или расхода. Одна на внесение и правку: у кассы нет полей,
 * которые при правке вели бы себя иначе, а две формы расходятся со временем.
 *
 * Диалог держит только открытие и закрытие; сама форма монтируется заново на
 * каждое открытие, поэтому начальные значения — это просто инициализаторы
 * состояния, а не синхронизация в эффекте.
 */
export function CashEntryDialog({
  draft,
  onClose,
  ...rest
}: Omit<FormProps, "draft" | "onCancel"> & {
  draft: CashEntryDraft | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (draft && !dialog.open) {
      dialog.showModal();
      // showModal сам ставит фокус на первый элемент — переключатель
      // «Доход». На ресепшене первым набирают сумму, поэтому переводим фокус
      // туда явно: React-овский autoFocus срабатывает раньше и перебивается.
      dialog.querySelector<HTMLInputElement>("[data-autofocus]")?.focus();
    }
    if (!draft && dialog.open) dialog.close();
  }, [draft]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="cash-entry-title"
      onClose={onClose}
      className="m-auto w-[min(94vw,30rem)] rounded-3xl border border-glass-brd bg-bg-0 p-0 text-text-0 backdrop:bg-black/60"
    >
      {draft ? (
        <EntryForm
          {...rest}
          draft={draft}
          onCancel={() => dialogRef.current?.close()}
        />
      ) : null}
    </dialog>
  );
}

function EntryForm({
  stayId,
  currency,
  categories,
  guests,
  nightPriceMinor,
  templates,
  draft,
  onCancel,
  onSaved,
}: FormProps) {
  const { entry } = draft;
  // Правка берёт значения записи, дубль и шаблон — черновика.
  const initial = entry ?? draft.prefill ?? null;
  const [guestId, setGuestId] = useState(initial?.guestId ?? "");
  const [nights, setNights] = useState(
    initial?.nights ? String(initial.nights) : "",
  );
  /** Сумму набрали руками — подсказка «сутки × цена» её больше не трогает. */
  const [amountTouched, setAmountTouched] = useState(Boolean(initial));
  const [kind, setKind] = useState<TravelCashKind>(initial?.kind ?? draft.kind);
  const [amount, setAmount] = useState(
    initial ? moneyInputValue(initial.amountMinor) : "",
  );
  const [occurredOn, setOccurredOn] = useState(
    () => initial?.occurredOn ?? localToday(),
  );
  const [categoryId, setCategoryId] = useState<string | null>(
    initial?.categoryId ?? null,
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [tags, setTags] = useState(initial?.tags?.join(", ") ?? "");

  const kindTemplates = templates.filter((template) => template.kind === kind);

  function applyTemplate(template: TravelCashTemplateDto) {
    if (template.amountMinor) {
      setAmount(moneyInputValue(template.amountMinor));
      setAmountTouched(true);
    }
    setCategoryId(template.categoryId);
    if (template.note) setNote(template.note);
    if (template.tags.length) setTags(template.tags.join(", "));
  }
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = categories.filter((category) => category.kind === kind);
  const selectedGuest = guests.find((guest) => guest.id === guestId) ?? null;

  function changeNights(value: string) {
    setNights(value);
    const suggestion = suggestedAmountMinor(
      Number.parseInt(value, 10) || null,
      nightPriceMinor,
    );
    if (!amountTouched && suggestion) setAmount(moneyInputValue(suggestion));
  }

  function switchKind(next: TravelCashKind) {
    setKind(next);
    // Сутки оплачивает только гость в доходе.
    if (next === "expense") setNights("");
    // Статья другого вида сервер всё равно не примет — сбрасываем сразу.
    if (categories.find((c) => c.id === categoryId)?.kind !== next) {
      setCategoryId(null);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amountMinor = parseMoneyInput(amount);
    if (amountMinor === null) {
      setError("Сумма — это число больше нуля, копейки через запятую");
      return;
    }
    const body = {
      kind,
      amountMinor,
      occurredOn,
      categoryId,
      note: note.trim(),
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      guestId: guestId || null,
      nights:
        kind === "income" && guestId && nights
          ? Number.parseInt(nights, 10)
          : null,
    };
    setPending(true);
    setError(null);
    try {
      if (entry) {
        await updateCashEntry(stayId, entry.id, body);
      } else {
        await createCashEntry(stayId, body);
      }
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не сохранилось");
      setPending(false);
    }
  }

  async function remove() {
    if (!entry) return;
    if (!window.confirm("Удалить запись? Остатки пересчитаются.")) return;
    setPending(true);
    setError(null);
    try {
      await removeCashEntry(stayId, entry.id);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалилось");
      setPending(false);
    }
  }

  const title = entry
    ? "Правка записи"
    : kind === "income"
      ? "Новый доход"
      : "Новый расход";

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4 p-6">
      <h2 id="cash-entry-title" className="font-display text-lg font-bold">
        {title}
      </h2>

      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="sr-only">Доход или расход</legend>
        {(
          [
            ["income", "Доход"],
            ["expense", "Расход"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={`cursor-pointer rounded-xl border px-3 py-2 text-center text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-magenta ${
              kind === value
                ? "border-magenta font-semibold text-text-0"
                : "border-glass-brd text-text-1"
            }`}
          >
            <input
              type="radio"
              name="cash-kind"
              value={value}
              checked={kind === value}
              onChange={() => switchKind(value)}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </fieldset>

      {!entry && kindTemplates.length > 0 ? (
        <div>
          <p className="text-sm text-text-1">Шаблоны</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {kindTemplates.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className="rounded-xl border border-glass-brd px-2.5 py-1.5 text-sm text-text-1"
                >
                  {templateLabel(template, currency)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <label className="block text-sm text-text-1">
          Сумма, {TRAVEL_CURRENCY_SIGNS[currency]}
          <input
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setAmountTouched(true);
            }}
            inputMode="decimal"
            autoComplete="off"
            required
            data-autofocus
            placeholder="850"
            className={`${fieldClass} font-mono text-base`}
          />
        </label>
        <label className="block text-sm text-text-1">
          Дата
          <input
            type="date"
            value={occurredOn}
            onChange={(event) => setOccurredOn(event.target.value)}
            required
            className={fieldClass}
          />
        </label>
      </div>

      <fieldset>
        <legend className="text-sm text-text-1">Статья</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {visible.map((category) => (
            <label
              key={category.id}
              className={`flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-magenta ${
                categoryId === category.id
                  ? "border-magenta text-text-0"
                  : "border-glass-brd text-text-1"
              }`}
            >
              <input
                type="radio"
                name="cash-category"
                value={category.id}
                checked={categoryId === category.id}
                onChange={() => setCategoryId(category.id)}
                className="sr-only"
              />
              <CashIcon icon={category.icon} className="size-4" />
              {category.name}
            </label>
          ))}
          {categoryId ? (
            <button
              type="button"
              onClick={() => setCategoryId(null)}
              className="rounded-xl px-2.5 py-1.5 text-sm text-text-2 underline-offset-4 hover:underline"
            >
              Без статьи
            </button>
          ) : null}
        </div>
      </fieldset>

      {guests.length > 0 ? (
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <label className="block text-sm text-text-1">
            Гость
            <select
              value={guestId}
              onChange={(event) => setGuestId(event.target.value)}
              className={fieldClass}
            >
              <option value="">Не про гостя</option>
              {guests.map((guest) => (
                <option key={guest.id} value={guest.id}>
                  {guest.fullName}
                  {guest.living ? "" : " (выехал)"}
                </option>
              ))}
            </select>
          </label>
          {kind === "income" && guestId ? (
            <label className="block w-24 text-sm text-text-1">
              Суток
              <input
                value={nights}
                onChange={(event) => changeNights(event.target.value)}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                placeholder="—"
                className={`${fieldClass} font-mono`}
              />
            </label>
          ) : null}
          {selectedGuest ? (
            <p className="col-span-2 -mt-2 text-xs text-text-2">
              {guestPaymentLabel(selectedGuest) || "Выехал, долга нет"}
            </p>
          ) : null}
        </div>
      ) : null}

      <label className="block text-sm text-text-1">
        Заметка
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={300}
          placeholder="Кэлин Вячеслав, замена цепи…"
          className={fieldClass}
        />
      </label>

      <label className="block text-sm text-text-1">
        Теги через запятую
        <input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="наличные, авито"
          className={fieldClass}
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm text-magenta">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="btn-mint flex-1 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1"
        >
          Отмена
        </button>
        {entry ? (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={pending}
            className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 disabled:opacity-50"
          >
            Удалить
          </button>
        ) : null}
      </div>
    </form>
  );
}
