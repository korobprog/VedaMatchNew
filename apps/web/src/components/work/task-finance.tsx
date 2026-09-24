"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Loader2, Play, Plus, Square, Trash2 } from "lucide-react";
import type {
  WorkLineItemKind,
  WorkTaskFinanceDto,
  WorkTimeEntryDto,
} from "@vedamatch/shared";
import {
  addWorkLineItem,
  addWorkTime,
  getWorkTaskFinance,
  removeWorkLineItem,
  removeWorkTime,
  startWorkTimer,
  stopWorkTimer,
  updateWorkTaskFinance,
} from "@/lib/work-api";
import {
  formatElapsed,
  formatMinutes,
  formatMoney,
  minutesToHoursInput,
  moneyToInput,
  parseHoursInput,
  parseMoneyInput,
  toDateTimeLocal,
} from "./finance-format";

const INPUT =
  "rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0";

/**
 * Время и стоимость карточки коммерческой доски (VED-458): оценка, таймер,
 * часы задним числом, смета. Ставки, чужие суммы и смету видят ведущий и
 * администрация; исполнитель — свои часы и свои суммы.
 */
export function WorkTaskFinance({
  taskId,
  canEdit,
  onChanged,
}: {
  taskId: string;
  canEdit: boolean;
  /** Итоги поменялись — шапке доски пора перечитать бюджет. */
  onChanged?: () => void;
}) {
  const id = useId();
  const [finance, setFinance] = useState<WorkTaskFinanceDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [estimate, setEstimate] = useState("");
  const [price, setPrice] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualStart, setManualStart] = useState("");
  const [manualHours, setManualHours] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [itemKind, setItemKind] = useState<WorkLineItemKind>("expense");
  const [itemTitle, setItemTitle] = useState("");
  const [itemAmount, setItemAmount] = useState("");

  const accept = useCallback((next: WorkTaskFinanceDto) => {
    setFinance(next);
    setEstimate(minutesToHoursInput(next.estimateMinutes));
    setPrice(next.priceMinor === null ? "" : moneyToInput(next.priceMinor));
  }, []);

  useEffect(() => {
    let alive = true;
    getWorkTaskFinance(taskId)
      .then((next) => alive && accept(next))
      .catch((cause) =>
        alive &&
        setError(cause instanceof Error ? cause.message : "Не загрузилось"),
      );
    return () => {
      alive = false;
    };
  }, [taskId, accept]);

  // Секундомер идёт только пока таймер запущен: без него тикать незачем.
  const running = finance?.running ?? null;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  async function run(action: () => Promise<WorkTaskFinanceDto>) {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      accept(await action());
      onChanged?.();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!finance) {
    return (
      <section className="mt-5" aria-labelledby={`${id}-title`}>
        <h3 id={`${id}-title`} className="text-sm font-semibold text-text-0">
          Время и стоимость
        </h3>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-magenta">
            {error}
          </p>
        ) : (
          <p className="mt-2 flex items-center gap-2 text-sm text-text-2">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Считаем…
          </p>
        )}
      </section>
    );
  }

  const money = (minor: number) => formatMoney(minor, finance.currency);
  const hourly = finance.pricingModel === "hourly";
  const onRequest = hourly && finance.overtimeMode === "on_request";

  function saveEstimate() {
    const minutes = parseHoursInput(estimate);
    if (Number.isNaN(minutes)) {
      setError("Оценка: часы, например 8 или 1,5");
      return;
    }
    if (minutes === finance?.estimateMinutes) return;
    void run(() =>
      updateWorkTaskFinance(taskId, { estimateMinutes: minutes }),
    );
  }

  function savePrice() {
    const minor = parseMoneyInput(price);
    if (Number.isNaN(minor)) {
      setError("Цена: число, например 12000");
      return;
    }
    if (minor === finance?.priceMinor) return;
    void run(() => updateWorkTaskFinance(taskId, { priceMinor: minor }));
  }

  function openManual() {
    setManualStart(toDateTimeLocal(new Date(Date.now() - 60 * 60_000)));
    setManualHours("1");
    setManualNote("");
    setManualOpen(true);
  }

  async function submitManual(event: React.FormEvent) {
    event.preventDefault();
    const minutes = parseHoursInput(manualHours);
    const start = new Date(manualStart);
    if (minutes === null || Number.isNaN(minutes) || minutes <= 0) {
      setError("Сколько: часы, например 2 или 1:30");
      return;
    }
    if (Number.isNaN(start.getTime())) {
      setError("Когда: выберите дату и время");
      return;
    }
    const done = await run(() =>
      addWorkTime(taskId, {
        startedAt: start.toISOString(),
        minutes,
        note: manualNote,
      }),
    );
    if (done) setManualOpen(false);
  }

  async function submitItem(event: React.FormEvent) {
    event.preventDefault();
    const amount = parseMoneyInput(itemAmount);
    if (amount === null || Number.isNaN(amount) || amount <= 0) {
      setError("Сумма строки: число больше нуля");
      return;
    }
    const done = await run(() =>
      addWorkLineItem(taskId, {
        kind: itemKind,
        title: itemTitle,
        amountMinor: amount,
      }),
    );
    if (done) {
      setItemTitle("");
      setItemAmount("");
    }
  }

  const totals = finance.totals;

  return (
    <section className="mt-5" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="text-sm font-semibold text-text-0">
        Время и стоимость{" "}
        <span className="font-normal text-text-2">
          {formatMinutes(totals.minutes)}
          {totals.totalMinor !== null && ` · ${money(totals.totalMinor)}`}
        </span>
      </h3>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1" htmlFor={`${id}-estimate`}>
          <span className="text-xs text-text-1">Оценка, ч</span>
          <input
            id={`${id}-estimate`}
            value={estimate}
            onChange={(event) => setEstimate(event.target.value)}
            onBlur={saveEstimate}
            readOnly={!canEdit}
            inputMode="decimal"
            placeholder="—"
            className={`${INPUT} w-24`}
          />
        </label>
        {!hourly && finance.canSeeFinance && (
          <label className="flex flex-col gap-1" htmlFor={`${id}-price`}>
            <span className="text-xs text-text-1">Цена задачи</span>
            <input
              id={`${id}-price`}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              onBlur={savePrice}
              inputMode="decimal"
              placeholder="—"
              className={`${INPUT} w-32`}
            />
          </label>
        )}
        {finance.estimateMinor !== null && (
          <p className="pb-2 text-sm text-text-1">
            Оценка: {money(finance.estimateMinor)}
          </p>
        )}
      </div>

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {running ? (
            <button
              type="button"
              onClick={() => void run(() => stopWorkTimer(taskId))}
              disabled={busy}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-magenta px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Square aria-hidden className="size-4" />
              Остановить ·{" "}
              <span className="font-mono" aria-live="off">
                {formatElapsed(now - new Date(running.startedAt).getTime())}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void run(() => startWorkTimer(taskId))}
              disabled={busy}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-glass px-3 py-2 text-sm text-text-0 disabled:opacity-50"
            >
              <Play aria-hidden className="size-4" />
              Засечь время
            </button>
          )}
          <button
            type="button"
            onClick={openManual}
            aria-expanded={manualOpen}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-glass px-3 py-2 text-sm text-text-0"
          >
            <Plus aria-hidden className="size-4" />
            Записать время
          </button>
        </div>
      )}

      {manualOpen && (
        <form
          onSubmit={submitManual}
          className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-glass-brd p-3"
        >
          <label className="flex flex-col gap-1" htmlFor={`${id}-start`}>
            <span className="text-xs text-text-1">Когда начали</span>
            <input
              id={`${id}-start`}
              type="datetime-local"
              value={manualStart}
              onChange={(event) => setManualStart(event.target.value)}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1" htmlFor={`${id}-hours`}>
            <span className="text-xs text-text-1">Сколько, ч</span>
            <input
              id={`${id}-hours`}
              value={manualHours}
              onChange={(event) => setManualHours(event.target.value)}
              inputMode="decimal"
              className={`${INPUT} w-24`}
            />
          </label>
          <label
            className="flex min-w-40 flex-1 flex-col gap-1"
            htmlFor={`${id}-note`}
          >
            <span className="text-xs text-text-1">Что делали</span>
            <input
              id={`${id}-note`}
              value={manualNote}
              onChange={(event) => setManualNote(event.target.value)}
              maxLength={200}
              className={INPUT}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-xl bg-magenta px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Записать
          </button>
          <button
            type="button"
            onClick={() => setManualOpen(false)}
            className="min-h-11 rounded-xl px-3 py-2 text-sm text-text-1"
          >
            Отмена
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-magenta">
          {error}
        </p>
      )}

      {finance.entries.length > 0 && (
        <ul className="mt-3 divide-y divide-glass-brd rounded-xl border border-glass-brd">
          {finance.entries.map((entry) => (
            <TimeEntryRow
              key={entry.id}
              entry={entry}
              money={money}
              onRequest={onRequest}
              canRemove={canEdit && (entry.mine || finance.canSeeFinance)}
              busy={busy}
              onRemove={() => void run(() => removeWorkTime(entry.id))}
            />
          ))}
        </ul>
      )}

      {finance.canSeeFinance && (
        <div className="mt-3">
          {finance.lineItems.length > 0 && (
            <ul className="space-y-1 text-sm">
              {finance.lineItems.map((item) => (
                <li key={item.id} className="flex items-center gap-2">
                  <span className="text-text-2">
                    {item.kind === "expense" ? "Расход" : "Скидка"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-text-0">
                    {item.title}
                  </span>
                  <span className="font-mono text-text-0">
                    {item.kind === "discount" ? "−" : ""}
                    {money(item.amountMinor)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void run(() => removeWorkLineItem(item.id))
                    }
                    disabled={busy}
                    aria-label={`Удалить строку «${item.title}»`}
                    className="flex size-9 items-center justify-center rounded-lg text-text-2 hover:text-text-0"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            onSubmit={submitItem}
            className="mt-2 flex flex-wrap items-end gap-2"
          >
            <label className="flex flex-col gap-1" htmlFor={`${id}-kind`}>
              <span className="text-xs text-text-1">Строка сметы</span>
              <select
                id={`${id}-kind`}
                value={itemKind}
                onChange={(event) =>
                  setItemKind(event.target.value as WorkLineItemKind)
                }
                className={INPUT}
              >
                <option value="expense">Расход</option>
                <option value="discount">Скидка</option>
              </select>
            </label>
            <label
              className="flex min-w-32 flex-1 flex-col gap-1"
              htmlFor={`${id}-item-title`}
            >
              <span className="text-xs text-text-1">Название</span>
              <input
                id={`${id}-item-title`}
                value={itemTitle}
                onChange={(event) => setItemTitle(event.target.value)}
                maxLength={120}
                placeholder="Шрифт, хостинг"
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-1" htmlFor={`${id}-amount`}>
              <span className="text-xs text-text-1">Сумма</span>
              <input
                id={`${id}-amount`}
                value={itemAmount}
                onChange={(event) => setItemAmount(event.target.value)}
                inputMode="decimal"
                className={`${INPUT} w-28`}
              />
            </label>
            <button
              type="submit"
              disabled={busy || !itemTitle.trim() || !itemAmount.trim()}
              className="min-h-11 rounded-xl bg-glass px-3 py-2 text-sm text-text-0 disabled:opacity-50"
            >
              Добавить
            </button>
          </form>

          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-glass px-3 py-2 text-sm">
            <dt className="text-text-1">
              Работа
              {hourly &&
                ` · в норме ${formatMinutes(totals.normalMinutes)}` +
                  (totals.overtimeMinutes > 0
                    ? `, сверх ${formatMinutes(totals.overtimeMinutes)}`
                    : "")}
            </dt>
            <dd className="text-right font-mono text-text-0">
              {money(totals.workMinor ?? 0)}
            </dd>
            {(totals.expensesMinor ?? 0) > 0 && (
              <>
                <dt className="text-text-1">Расходы</dt>
                <dd className="text-right font-mono text-text-0">
                  {money(totals.expensesMinor ?? 0)}
                </dd>
              </>
            )}
            {(totals.discountMinor ?? 0) > 0 && (
              <>
                <dt className="text-text-1">Скидка</dt>
                <dd className="text-right font-mono text-text-0">
                  −{money(totals.discountMinor ?? 0)}
                </dd>
              </>
            )}
            <dt className="font-semibold text-text-0">Итого</dt>
            <dd className="text-right font-mono font-semibold text-text-0">
              {money(totals.totalMinor ?? 0)}
            </dd>
          </dl>
          {totals.pendingOvertimeMinutes > 0 && (
            <p className="mt-1 text-xs text-text-1">
              Сверх нормы {formatMinutes(totals.pendingOvertimeMinutes)} ждут
              одобрения ведущего и в итог не вошли.
            </p>
          )}
        </div>
      )}

      {!finance.canSeeFinance && finance.mine.minutes > 0 && (
        <p className="mt-3 text-sm text-text-1">
          Ваше время: {formatMinutes(finance.mine.minutes)} ·{" "}
          {money(finance.mine.amountMinor)}
        </p>
      )}
    </section>
  );
}

function TimeEntryRow({
  entry,
  money,
  onRequest,
  canRemove,
  busy,
  onRemove,
}: {
  entry: WorkTimeEntryDto;
  money: (minor: number) => string;
  onRequest: boolean;
  canRemove: boolean;
  busy: boolean;
  onRemove: () => void;
}) {
  const start = new Date(entry.startedAt);
  const when = start.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
      <span className="text-text-0">
        {entry.person?.name ?? "Удалённый участник"}
      </span>
      <span className="text-text-2">{when}</span>
      <span className="font-mono text-text-0">
        {entry.endedAt ? formatMinutes(entry.minutes) : "идёт"}
      </span>
      {entry.overtimeMinutes > 0 && (
        <span className="rounded-full border border-glass-brd px-2 py-0.5 text-xs text-text-1">
          сверх нормы {formatMinutes(entry.overtimeMinutes)}
          {onRequest && " · ждёт одобрения"}
        </span>
      )}
      {entry.note && (
        <span className="min-w-0 basis-full truncate text-text-1">
          {entry.note}
        </span>
      )}
      <span className="ml-auto flex items-center gap-1">
        {entry.amountMinor !== null && (
          <span className="font-mono text-text-0">
            {money(entry.amountMinor)}
          </span>
        )}
        {canRemove && entry.endedAt && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            aria-label={`Удалить запись времени от ${when}`}
            className="flex size-9 items-center justify-center rounded-lg text-text-2 hover:text-text-0"
          >
            <Trash2 aria-hidden className="size-4" />
          </button>
        )}
      </span>
    </li>
  );
}
