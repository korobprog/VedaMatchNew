"use client";

import { useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import type { WorkPayoutActDto } from "@vedamatch/shared";
import { getWorkPayoutAct } from "@/lib/work-api";
import { formatMinutes, formatMoney, formatPayoutRange } from "./finance-format";

/**
 * Акт выполненных работ для клиента (VED-461). «Сохранить PDF» — печать
 * браузера: она сама кладёт кириллицу и таблицу в PDF, без библиотеки и
 * шрифтов на сервере. Кнопки при печати прячутся.
 */
export function WorkPayoutActView({ token }: { token: string }) {
  const [act, setAct] = useState<WorkPayoutActDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getWorkPayoutAct(token)
      .then((next) => alive && setAct(next))
      .catch(() =>
        alive &&
        setError("Акт не найден: ссылка неверна или её закрыли"),
      );
    return () => {
      alive = false;
    };
  }, [token]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-magenta">
        {error}
      </p>
    );
  }
  if (!act) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-2">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        Открываем акт…
      </p>
    );
  }

  const money = (minor: number) => formatMoney(minor, act.currency);
  const year = act.toDay.slice(0, 4);
  const hourly = act.pricingModel === "hourly";

  return (
    <article className="rounded-2xl border border-glass-brd bg-bg-0 p-6 text-text-0 print:rounded-none print:border-0 print:p-0">
      <div className="mb-6 flex flex-wrap items-start gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">
            Акт выполненных работ
          </h1>
          <p className="mt-1 text-text-1">
            за {formatPayoutRange(act.fromDay, act.toDay)} {year} года
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto flex min-h-11 items-center gap-2 rounded-xl bg-magenta px-4 py-2 text-sm font-semibold text-white print:hidden"
        >
          <Printer aria-hidden className="size-4" />
          Сохранить PDF
        </button>
      </div>

      <dl className="mb-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-text-2">Исполнитель</dt>
        <dd>
          {act.spaceName}
          {act.issuer ? ` · ведёт ${act.issuer}` : ""}
        </dd>
        {act.clientName && (
          <>
            <dt className="text-text-2">Заказчик</dt>
            <dd>{act.clientName}</dd>
          </>
        )}
        <dt className="text-text-2">Работы</dt>
        <dd>{act.boardName}</dd>
        <dt className="text-text-2">Состояние</dt>
        <dd>
          {act.status === "paid" && act.paidAt
            ? `оплачен ${new Date(act.paidAt).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}`
            : "ждёт оплаты"}
        </dd>
      </dl>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-glass-brd text-left text-text-2">
            <th scope="col" className="py-2 pr-3 font-normal">
              Задача
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-normal">
              {hourly ? "Время" : "Затрачено"}
            </th>
            <th scope="col" className="py-2 text-right font-normal">
              Сумма
            </th>
          </tr>
        </thead>
        <tbody>
          {act.lines.map((line) => (
            <tr key={line.key} className="border-b border-glass-brd align-top">
              <td className="py-2 pr-3">
                <span className="font-mono text-xs text-text-2">
                  {line.key}
                </span>{" "}
                {line.title}
                {!line.done && (
                  <span className="text-text-2"> · в работе</span>
                )}
                {(line.expensesMinor > 0 || line.discountMinor > 0) && (
                  <span className="block text-xs text-text-2">
                    {line.expensesMinor > 0 &&
                      `расходы ${money(line.expensesMinor)}`}
                    {line.expensesMinor > 0 && line.discountMinor > 0 && ", "}
                    {line.discountMinor > 0 &&
                      `скидка ${money(line.discountMinor)}`}
                  </span>
                )}
              </td>
              <td className="py-2 pr-3 text-right whitespace-nowrap">
                {formatMinutes(line.minutes)}
              </td>
              <td className="py-2 text-right font-mono whitespace-nowrap">
                {money(line.totalMinor)}
              </td>
            </tr>
          ))}
          {act.correctionsMinor > 0 && (
            <tr className="border-b border-glass-brd">
              <td className="py-2 pr-3" colSpan={2}>
                Доплата за часы сверх нормы, одобренные после прошлого акта
              </td>
              <td className="py-2 text-right font-mono whitespace-nowrap">
                {money(act.correctionsMinor)}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="pt-3 pr-3 text-left">
              Итого к оплате
            </th>
            <td className="pt-3 pr-3 text-right whitespace-nowrap">
              {formatMinutes(act.totals.minutes)}
            </td>
            <td className="pt-3 text-right font-mono text-lg font-bold whitespace-nowrap">
              {money(act.totals.totalMinor)}
            </td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-8 text-xs text-text-2">
        Акт сформирован{" "}
        {new Date(act.closedAt).toLocaleDateString("ru-RU", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}{" "}
        в VedaMatch по учёту времени и смете доски.
      </p>
    </article>
  );
}
