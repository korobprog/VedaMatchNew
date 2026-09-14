"use client";

import { useEffect, useRef } from "react";
import type {
  TravelCashCategoryDto,
  TravelCashEntryDto,
  TravelCurrency,
} from "@vedamatch/shared";
import { CashIcon } from "./cash-icons";
import { formatSigned } from "./cash-money";
import { nightsLabel, shortDate } from "./guest-format";

export type CashEntryAction =
  | "edit"
  | "duplicate"
  | "template"
  | "filter-category"
  | "filter-guest"
  | "select"
  | "delete";

const createdLabel = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Меню записи кассы: сведения о ней и что с ней сделать. Открывается по
 * нажатию на строку ленты — правка теперь один из пунктов, а не действие по
 * умолчанию: случайное касание на ресепшене не должно открывать форму.
 */
export function CashEntryActions({
  entry,
  category,
  currency,
  onAction,
  onClose,
}: {
  entry: TravelCashEntryDto | null;
  category: TravelCashCategoryDto | undefined;
  currency: TravelCurrency;
  onAction: (action: CashEntryAction, entry: TravelCashEntryDto) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (entry && !dialog.open) dialog.showModal();
    if (!entry && dialog.open) dialog.close();
  }, [entry]);

  const actions: { action: CashEntryAction; label: string }[] = entry
    ? [
        { action: "edit", label: "Редактировать" },
        { action: "duplicate", label: "Дублировать" },
        { action: "template", label: "Сохранить как шаблон" },
        ...(entry.categoryId
          ? [
              {
                action: "filter-category" as const,
                label: `Все записи «${category?.name ?? "статьи"}»`,
              },
            ]
          : []),
        ...(entry.guestId
          ? [
              {
                action: "filter-guest" as const,
                label: `Все записи гостя ${entry.guestName ?? ""}`.trim(),
              },
            ]
          : []),
        { action: "select", label: "Выбрать несколько" },
        { action: "delete", label: "Удалить" },
      ]
    : [];

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="cash-actions-title"
      onClose={onClose}
      className="m-auto w-[min(94vw,26rem)] rounded-3xl border border-glass-brd bg-bg-0 p-0 text-text-0 backdrop:bg-black/60"
    >
      {entry ? (
        <div className="space-y-4 p-6">
          <div className="flex items-start gap-3">
            <CashIcon
              icon={category?.icon}
              className="mt-1 size-6 shrink-0 text-text-1"
            />
            <div className="min-w-0 flex-1">
              <h2
                id="cash-actions-title"
                className="font-display text-lg font-bold"
              >
                {category?.name ?? "Без статьи"}
              </h2>
              <p className="font-mono text-xl font-bold">
                {formatSigned(
                  entry.kind === "income"
                    ? entry.amountMinor
                    : -entry.amountMinor,
                  currency,
                )}
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-text-2">Дата</dt>
            <dd className="text-text-0">{shortDate(entry.occurredOn)}</dd>
            {entry.guestName ? (
              <>
                <dt className="text-text-2">Гость</dt>
                <dd className="text-text-0">
                  {entry.guestName}
                  {entry.nights ? ` · ${nightsLabel(entry.nights)}` : ""}
                </dd>
              </>
            ) : null}
            {entry.note ? (
              <>
                <dt className="text-text-2">Заметка</dt>
                <dd className="text-text-0">{entry.note}</dd>
              </>
            ) : null}
            {entry.tags.length ? (
              <>
                <dt className="text-text-2">Теги</dt>
                <dd className="text-text-0">
                  {entry.tags.map((tag) => `#${tag}`).join(" ")}
                </dd>
              </>
            ) : null}
            <dt className="text-text-2">Внесено</dt>
            <dd className="text-text-0">
              {createdLabel.format(new Date(entry.createdAt))}
              {entry.authorName ? ` · ${entry.authorName}` : ""}
            </dd>
          </dl>

          <ul className="space-y-2">
            {actions.map(({ action, label }) => (
              <li key={action}>
                <button
                  type="button"
                  onClick={() => onAction(action, entry)}
                  className="w-full rounded-xl border border-glass-brd px-4 py-2 text-left text-sm text-text-0"
                >
                  {label}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="w-full rounded-xl px-4 py-2 text-left text-sm text-text-2"
              >
                Закрыть
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </dialog>
  );
}
