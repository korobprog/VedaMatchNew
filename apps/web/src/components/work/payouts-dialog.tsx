"use client";

import { useEffect, useId, useState } from "react";
import { Check, ChevronDown, FileText, Link2, Loader2, X } from "lucide-react";
import type {
  WorkCurrency,
  WorkPayoutPeriodDto,
  WorkPayoutsDto,
} from "@vedamatch/shared";
import {
  closeWorkPayout,
  getWorkPayouts,
  markWorkPayout,
  shareWorkPayout,
  unshareWorkPayout,
} from "@/lib/work-api";
import {
  PAYOUT_STATUS_LABEL,
  describePayoutSchedule,
  formatDayRange,
  formatMinutes,
  formatMoney,
  formatPayoutRange,
} from "./finance-format";

const STATUS_CLASS: Record<WorkPayoutPeriodDto["status"], string> = {
  open: "border-cyan text-cyan",
  closed: "border-magenta text-magenta",
  sent: "border-glass-brd text-text-1",
  paid: "border-glass-brd text-text-2",
};

/**
 * Календарь выплат коммерческой доски (VED-460): идущий период на сейчас,
 * подбитые — с замороженным итогом, кому сколько и что сделано. Ведущий
 * подбивает досрочно и отмечает отправку и оплату; исполнитель видит свои
 * суммы.
 */
export function WorkPayoutsDialog({
  boardId,
  onClose,
  onChanged,
}: {
  boardId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const id = useId();
  const [data, setData] = useState<WorkPayoutsDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    let alive = true;
    getWorkPayouts(boardId)
      .then((next) => alive && setData(next))
      .catch((cause) =>
        alive &&
        setError(cause instanceof Error ? cause.message : "Не загрузилось"),
      );
    return () => {
      alive = false;
    };
  }, [boardId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(action: () => Promise<WorkPayoutsDto>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setData(await action());
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось");
    } finally {
      setBusy(false);
      setConfirmClose(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col gap-3 overflow-y-auto rounded-t-2xl bg-sheet p-4 sm:rounded-2xl">
        <div className="flex items-center gap-2">
          <h2
            id={`${id}-title`}
            className="font-display text-base font-semibold text-text-0"
          >
            Выплаты
          </h2>
          {data && (
            <span className="text-sm text-text-2">
              {describePayoutSchedule(data.period, data.payoutDay)}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="ml-auto flex size-10 items-center justify-center rounded-lg text-text-1 hover:text-text-0"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        {error && (
          <p role="alert" className="text-sm text-magenta">
            {error}
          </p>
        )}

        {!data ? (
          <p className="flex items-center gap-2 text-sm text-text-2">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Считаем…
          </p>
        ) : (
          <>
            <PeriodCard
              period={data.current}
              currency={data.currency}
              canManage={data.canManage}
              defaultOpen
              busy={busy}
              onMark={() => undefined}
            >
              {data.canManage && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {confirmClose ? (
                    <>
                      <span className="text-sm text-text-1">
                        Подбить по сегодняшний день? Итог заморозится, поздние
                        часы уйдут в следующий период.
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => closeWorkPayout(boardId))}
                        className="min-h-11 rounded-xl bg-magenta px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Подбить
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClose(false)}
                        className="min-h-11 rounded-xl px-3 py-2 text-sm text-text-1"
                      >
                        Отмена
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmClose(true)}
                      className="min-h-11 rounded-xl bg-glass px-3 py-2 text-sm text-text-0"
                    >
                      Подбить сейчас
                    </button>
                  )}
                </div>
              )}
            </PeriodCard>

            {data.closed.length > 0 && (
              <h3 className="mt-1 text-sm font-semibold text-text-0">
                Подбитые
              </h3>
            )}
            {data.closed.map((period) => (
              <PeriodCard
                key={period.id}
                period={period}
                currency={data.currency}
                canManage={data.canManage}
                busy={busy}
                onMark={(status, note) =>
                  void run(() =>
                    markWorkPayout(period.id as string, { status, note }),
                  )
                }
              >
                {data.canManage && (
                  <ActLink
                    periodId={period.id as string}
                    token={period.actToken}
                    busy={busy}
                    onShared={() =>
                      void run(() => getWorkPayouts(boardId))
                    }
                    onUnshare={() =>
                      void run(() => unshareWorkPayout(period.id as string))
                    }
                    onError={setError}
                  />
                )}
              </PeriodCard>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function PeriodCard({
  period,
  currency,
  canManage,
  defaultOpen = false,
  busy,
  onMark,
  children,
}: {
  period: WorkPayoutPeriodDto;
  currency: WorkCurrency;
  canManage: boolean;
  defaultOpen?: boolean;
  busy: boolean;
  onMark: (status: "sent" | "paid", note: string) => void;
  children?: React.ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [note, setNote] = useState("");
  const money = (minor: number) => formatMoney(minor, currency);
  const { snapshot } = period;
  const empty = snapshot.totals.minutes === 0 && snapshot.totals.totalMinor === 0;

  return (
    <section className="rounded-xl border border-glass-brd">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={`${id}-body`}
        className="flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm"
      >
        <span className="font-semibold text-text-0">
          {formatPayoutRange(period.fromDay, period.toDay)}
        </span>
        <span className="font-mono text-text-0">
          {money(snapshot.totals.totalMinor)}
        </span>
        <span className="text-text-2">
          {formatMinutes(snapshot.totals.minutes)}
        </span>
        <span
          className={`ml-auto rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[period.status]}`}
        >
          {PAYOUT_STATUS_LABEL[period.status]}
        </span>
        <ChevronDown
          aria-hidden
          className={`size-4 text-text-2 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div id={`${id}-body`} className="border-t border-glass-brd px-3 py-2 text-sm">
          {empty ? (
            <p className="text-text-1">
              {period.status === "open"
                ? "В этом периоде пока ни часов, ни денег."
                : "Пустой период: ни часов, ни денег."}
            </p>
          ) : (
            <>
              <h4 className="text-xs text-text-2">Кому сколько</h4>
              <ul className="mt-1 space-y-1">
                {snapshot.people.map((person) => (
                  <li
                    key={person.userId ?? "deleted"}
                    className="flex flex-wrap items-center gap-x-3"
                  >
                    <span className="text-text-0">{person.name}</span>
                    <span className="text-text-1">
                      {formatMinutes(person.normalMinutes)} в норме
                      {person.overtimeMinutes > 0 &&
                        `, ${formatMinutes(person.overtimeMinutes)} сверх`}
                      {person.pendingOvertimeMinutes > 0 &&
                        ` · не одобрено ${formatMinutes(person.pendingOvertimeMinutes)}`}
                    </span>
                    <span className="ml-auto font-mono text-text-0">
                      {money(person.workMinor)}
                    </span>
                  </li>
                ))}
              </ul>

              <h4 className="mt-3 text-xs text-text-2">Что сделано</h4>
              <ul className="mt-1 space-y-1">
                {snapshot.tasks.map((task) => (
                  <li key={task.taskId} className="flex items-center gap-2">
                    {task.done ? (
                      <Check aria-label="Закрыта" className="size-4 shrink-0 text-cyan" />
                    ) : (
                      <span aria-hidden className="size-4 shrink-0" />
                    )}
                    <span className="shrink-0 font-mono text-xs text-text-2">
                      {task.key}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-text-0">
                      {task.title}
                    </span>
                    <span className="text-text-1">
                      {formatMinutes(task.minutes)}
                    </span>
                    {canManage && (
                      <span className="w-24 text-right font-mono text-text-0">
                        {money(
                          task.workMinor + task.expensesMinor - task.discountMinor,
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {snapshot.corrections.length > 0 && (
                <>
                  <h4 className="mt-3 text-xs text-text-2">Корректировки</h4>
                  <ul className="mt-1 space-y-1 text-text-1">
                    {snapshot.corrections.map((row, index) => (
                      <li key={`${row.kind}-${row.taskKey}-${row.day}-${index}`}>
                        {row.kind === "late_time"
                          ? `${row.name}: ${formatMinutes(row.minutes)} за ${formatDayRange(row.day, row.day)} записано позже подбития (${row.taskKey})`
                          : `${row.name}: сверх нормы ${formatMinutes(row.minutes)} за ${formatDayRange(row.day, row.day)} одобрено позже — доплата ${money(row.amountMinor)}`}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {canManage && (
                <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-glass px-3 py-2">
                  <dt className="text-text-1">Работа</dt>
                  <dd className="text-right font-mono text-text-0">
                    {money(snapshot.totals.workMinor)}
                  </dd>
                  {snapshot.totals.expensesMinor > 0 && (
                    <>
                      <dt className="text-text-1">Расходы</dt>
                      <dd className="text-right font-mono text-text-0">
                        {money(snapshot.totals.expensesMinor)}
                      </dd>
                    </>
                  )}
                  {snapshot.totals.discountMinor > 0 && (
                    <>
                      <dt className="text-text-1">Скидка</dt>
                      <dd className="text-right font-mono text-text-0">
                        −{money(snapshot.totals.discountMinor)}
                      </dd>
                    </>
                  )}
                  <dt className="font-semibold text-text-0">К оплате</dt>
                  <dd className="text-right font-mono font-semibold text-text-0">
                    {money(snapshot.totals.totalMinor)}
                  </dd>
                </dl>
              )}
            </>
          )}

          {period.paidAt && (
            <p className="mt-2 text-xs text-text-2">
              Оплачено{" "}
              {new Date(period.paidAt).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
              })}
              {period.paidNote ? ` · ${period.paidNote}` : ""}
            </p>
          )}

          {canManage && (period.status === "closed" || period.status === "sent") && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {period.status === "closed" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onMark("sent", "")}
                  className="min-h-11 rounded-xl bg-glass px-3 py-2 text-sm text-text-0 disabled:opacity-50"
                >
                  Отправлено клиенту
                </button>
              )}
              <label className="sr-only" htmlFor={`${id}-note`}>
                Пояснение к оплате
              </label>
              <input
                id={`${id}-note`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={300}
                placeholder="Как оплачено, например перевод 25.09"
                className="min-w-40 flex-1 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => onMark("paid", note)}
                className="min-h-11 rounded-xl bg-magenta px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Оплачено
              </button>
            </div>
          )}
          {children}
        </div>
      )}
      {!open && children && period.status === "open" && (
        <div className="px-3 pb-2">{children}</div>
      )}
    </section>
  );
}

/** Адрес акта для клиента: ссылку ведущий пересылает в мессенджер. */
function actUrl(token: string): string {
  return `${window.location.origin}/work/act/${token}`;
}

/**
 * Акт для клиента (VED-461): открыть (оттуда — «Сохранить PDF»),
 * скопировать ссылку, закрыть её. Ссылка создаётся при первом открытии.
 */
function ActLink({
  periodId,
  token,
  busy,
  onShared,
  onUnshare,
  onError,
}: {
  periodId: string;
  token: string | null;
  busy: boolean;
  onShared: () => void;
  onUnshare: () => void;
  onError: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function ensureToken(): Promise<string | null> {
    if (token) return token;
    try {
      const shared = await shareWorkPayout(periodId);
      onShared();
      return shared.token;
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Не получилось");
      return null;
    }
  }

  async function open() {
    // Окно открываем сразу, до запроса: иначе браузер сочтёт его всплывающим.
    const tab = window.open("", "_blank");
    const next = await ensureToken();
    if (!next) {
      tab?.close();
      return;
    }
    if (tab) tab.location.href = actUrl(next);
  }

  async function copy() {
    const next = await ensureToken();
    if (!next) return;
    try {
      await navigator.clipboard.writeText(actUrl(next));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onError("Не удалось скопировать — откройте акт и скопируйте адрес");
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void open()}
        className="flex min-h-11 items-center gap-2 rounded-xl bg-glass px-3 py-2 text-sm text-text-0 disabled:opacity-50"
      >
        <FileText aria-hidden className="size-4" />
        Акт для клиента
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void copy()}
        className="flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
      >
        <Link2 aria-hidden className="size-4" />
        <span aria-live="polite">
          {copied ? "Ссылка скопирована" : "Скопировать ссылку"}
        </span>
      </button>
      {token && (
        <button
          type="button"
          disabled={busy}
          onClick={onUnshare}
          className="min-h-11 rounded-xl px-3 py-2 text-xs text-text-2 underline hover:text-text-0 disabled:opacity-50"
        >
          Закрыть ссылку
        </button>
      )}
    </div>
  );
}

