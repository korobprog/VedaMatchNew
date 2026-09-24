"use client";

import { useId } from "react";
import { WORK_CURRENCIES, type WorkCurrency } from "@vedamatch/shared";
import {
  type CommercialDraft,
  WEEKDAYS,
  currencySymbol,
  payoutDayFor,
} from "./finance-format";

const INPUT =
  "w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";
const LABEL = "text-xs text-text-1";

/**
 * Поля настроек оплаты коммерческой доски (VED-458): одни и те же при
 * создании среды и в настройках доски. Норма и сверх нормы — только при
 * почасовой оплате: при фиксированной цене часы не оплачиваются.
 */
export function CommercialSettingsFields({
  draft,
  onChange,
}: {
  draft: CommercialDraft;
  onChange: (next: CommercialDraft) => void;
}) {
  const id = useId();
  const symbol = currencySymbol(draft.currency);
  const set = (patch: Partial<CommercialDraft>) =>
    onChange({ ...draft, ...patch });
  const hourly = draft.pricingModel === "hourly";

  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="col-span-2 flex flex-col gap-1" htmlFor={`${id}-client`}>
        <span className={LABEL}>Клиент</span>
        <input
          id={`${id}-client`}
          value={draft.clientName}
          onChange={(event) => set({ clientName: event.target.value })}
          maxLength={80}
          placeholder="Храм на Бакинской"
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1" htmlFor={`${id}-pricing`}>
        <span className={LABEL}>Модель цены</span>
        <select
          id={`${id}-pricing`}
          value={draft.pricingModel}
          onChange={(event) =>
            set({
              pricingModel: event.target.value as CommercialDraft["pricingModel"],
            })
          }
          className={INPUT}
        >
          <option value="hourly">Почасовая</option>
          <option value="fixed">Фикс за задачу</option>
        </select>
      </label>

      <label className="flex flex-col gap-1" htmlFor={`${id}-currency`}>
        <span className={LABEL}>Валюта</span>
        <select
          id={`${id}-currency`}
          value={draft.currency}
          onChange={(event) =>
            set({ currency: event.target.value as WorkCurrency })
          }
          className={INPUT}
        >
          {WORK_CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {currencySymbol(code)} {code}
            </option>
          ))}
        </select>
      </label>

      {hourly && (
        <>
          <label className="flex flex-col gap-1" htmlFor={`${id}-rate`}>
            <span className={LABEL}>Ставка в норме, {symbol}/ч</span>
            <input
              id={`${id}-rate`}
              value={draft.rate}
              onChange={(event) => set({ rate: event.target.value })}
              inputMode="decimal"
              placeholder="1500"
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1" htmlFor={`${id}-norm`}>
            <span className={LABEL}>Норма в день, ч</span>
            <input
              id={`${id}-norm`}
              value={draft.normHours}
              onChange={(event) => set({ normHours: event.target.value })}
              inputMode="decimal"
              placeholder="без нормы"
              aria-describedby={`${id}-norm-hint`}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1" htmlFor={`${id}-overtime`}>
            <span className={LABEL}>Сверх нормы, {symbol}/ч</span>
            <input
              id={`${id}-overtime`}
              value={draft.overtimeRate}
              onChange={(event) => set({ overtimeRate: event.target.value })}
              inputMode="decimal"
              placeholder="2250"
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1" htmlFor={`${id}-mode`}>
            <span className={LABEL}>Часы сверх нормы</span>
            <select
              id={`${id}-mode`}
              value={draft.overtimeMode}
              onChange={(event) =>
                set({
                  overtimeMode: event.target
                    .value as CommercialDraft["overtimeMode"],
                })
              }
              className={INPUT}
            >
              <option value="on_request">Только по запросу</option>
              <option value="auto">Автоматически</option>
            </select>
          </label>
          <p id={`${id}-norm-hint`} className="col-span-2 text-xs text-text-2">
            Норма считается на исполнителя за день по всей доске. «Только по
            запросу» — часы сверх нормы видны, но в счёт идут после одобрения
            ведущим.
          </p>
        </>
      )}

      <label className="flex flex-col gap-1" htmlFor={`${id}-payout`}>
        <span className={LABEL}>Подбивать</span>
        <select
          id={`${id}-payout`}
          value={draft.payoutPeriod}
          onChange={(event) => {
            const period = event.target.value as CommercialDraft["payoutPeriod"];
            set({
              payoutPeriod: period,
              payoutDay: String(payoutDayFor(period, Number(draft.payoutDay))),
            });
          }}
          className={INPUT}
        >
          <option value="weekly">Раз в неделю</option>
          <option value="biweekly">Раз в две недели</option>
          <option value="monthly">Раз в месяц</option>
        </select>
      </label>
      <label className="flex flex-col gap-1" htmlFor={`${id}-payout-day`}>
        <span className={LABEL}>День подбития</span>
        <select
          id={`${id}-payout-day`}
          value={draft.payoutDay}
          onChange={(event) => set({ payoutDay: event.target.value })}
          className={INPUT}
        >
          {draft.payoutPeriod === "monthly"
            ? Array.from({ length: 28 }, (_, index) => (
                <option key={index + 1} value={String(index + 1)}>
                  {index + 1}-го числа
                </option>
              ))
            : WEEKDAYS.map((name, index) => (
                <option key={name} value={String(index + 1)}>
                  {name[0].toUpperCase() + name.slice(1)}
                </option>
              ))}
        </select>
      </label>

      <label className="col-span-2 flex flex-col gap-1" htmlFor={`${id}-budget`}>
        <span className={LABEL}>Бюджет доски, {symbol}</span>
        <input
          id={`${id}-budget`}
          value={draft.budget}
          onChange={(event) => set({ budget: event.target.value })}
          inputMode="decimal"
          placeholder="без бюджета"
          className={INPUT}
        />
      </label>
    </div>
  );
}

/** Выбор типа доски: обычная или коммерческая. */
export function BoardKindChoice({
  commercial,
  onChange,
}: {
  commercial: boolean;
  onChange: (commercial: boolean) => void;
}) {
  const options = [
    { value: false, title: "Обычная", hint: "Задачи без денег" },
    {
      value: true,
      title: "Коммерческая",
      hint: "Ставки, часы и бюджет клиента",
    },
  ];
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-text-0">Тип доски</legend>
      {options.map((option) => (
        <label
          key={option.title}
          className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 ${
            commercial === option.value
              ? "border-magenta"
              : "border-glass-brd"
          }`}
        >
          <input
            type="radio"
            name="work-board-kind"
            checked={commercial === option.value}
            onChange={() => onChange(option.value)}
            className="mt-1 accent-magenta"
          />
          <span className="flex flex-col">
            <span className="text-sm text-text-0">{option.title}</span>
            <span className="text-xs text-text-2">{option.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
