"use client";

import { useEffect, useId, useState } from "react";
import { CalendarClock, Clock, Coins, Loader2, Settings2, X } from "lucide-react";
import type {
  WorkBoardCommercialDto,
  WorkBoardDto,
  WorkBoardFinanceDto,
  WorkOvertimeRequestsDto,
} from "@vedamatch/shared";
import {
  cancelWorkOvertime,
  decideWorkOvertime,
  getWorkBoardFinance,
  getWorkOvertimeRequests,
  updateWorkBoard,
} from "@/lib/work-api";
import { OvertimeRequestList } from "./overtime-requests";
import { WorkPayoutsDialog } from "./payouts-dialog";
import {
  BoardKindChoice,
  CommercialSettingsFields,
} from "./commercial-settings-fields";
import {
  type CommercialDraft,
  EMPTY_COMMERCIAL_DRAFT,
  browserTimezone,
  commercialDraftToInput,
  formatMinutes,
  formatMoney,
  minutesToHoursInput,
  moneyToInput,
} from "./finance-format";

/** С этой доли бюджета полоса подсвечивается: пора говорить с клиентом. */
const BUDGET_WARN = 0.8;

function draftFrom(commercial: WorkBoardCommercialDto | null): CommercialDraft {
  if (!commercial) return EMPTY_COMMERCIAL_DRAFT;
  return {
    clientName: commercial.clientName,
    currency: commercial.currency,
    pricingModel: commercial.pricingModel,
    rate: moneyToInput(commercial.rates?.rateMinor ?? 0),
    normHours: minutesToHoursInput(commercial.dailyNormMinutes),
    overtimeRate: moneyToInput(commercial.rates?.overtimeRateMinor ?? 0),
    overtimeMode: commercial.overtimeMode,
    budget: moneyToInput(commercial.rates?.budgetMinor ?? 0),
    payoutPeriod: commercial.payoutPeriod,
    payoutDay: String(commercial.payoutDay),
    reminderDays: String(commercial.paymentReminderDays),
  };
}

/**
 * Шапка коммерческой доски (VED-458): клиент, ведущий, норма; ведущему и
 * администрации — ещё бюджет и сколько израсходовано. Отсюда же — настройки
 * оплаты и превращение обычной доски в коммерческую.
 */
export function WorkCommercialBar({
  board,
  canManageBoard,
  personal,
  onChanged,
}: {
  board: WorkBoardDto;
  /** Администрация среды: может сделать обычную доску коммерческой. */
  canManageBoard: boolean;
  /** Личная среда «Мои дела»: там кнопку не показываем, это не для клиентов. */
  personal: boolean;
  onChanged: (board: WorkBoardDto) => void;
}) {
  const [finance, setFinance] = useState<WorkBoardFinanceDto | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  // Из уведомления о подбитии ссылка ведёт с `?payouts=1` — окно выплат
  // открывается сразу, а не ищется глазами.
  const [payoutsOpen, setPayoutsOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("payouts"),
  );
  // Решили запрос в панели — шапке пора перечитать счётчик и израсходованное.
  const [financeVersion, setFinanceVersion] = useState(0);
  const commercial = board.commercial;
  const canEditSettings = commercial ? board.canSeeFinance : canManageBoard;

  const showFinance = Boolean(commercial) && board.canSeeFinance;

  // Бюджет перечитывается вместе с доской: доска обновляется по таймеру и
  // после правок карточки, а с ней — и израсходованное.
  useEffect(() => {
    if (!showFinance) return;
    let alive = true;
    getWorkBoardFinance(board.id)
      .then((next) => alive && setFinance(next))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [board, showFinance, financeVersion]);

  if (!commercial) {
    if (!canManageBoard || personal) return null;
    return (
      <>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm text-text-1 hover:text-text-0"
        >
          <Coins aria-hidden className="size-4" />
          <span className="hidden sm:inline">Оплата</span>
          <span className="sr-only sm:hidden">Сделать доску коммерческой</span>
        </button>
        {settingsOpen && (
          <CommercialSettingsDialog
            board={board}
            onClose={() => setSettingsOpen(false)}
            onSaved={(next) => {
              setSettingsOpen(false);
              onChanged(next);
            }}
          />
        )}
      </>
    );
  }

  const shown = showFinance ? finance : null;
  const spentShare =
    shown && shown.budgetMinor > 0
      ? shown.spentMinor / shown.budgetMinor
      : null;

  return (
    <section
      aria-label="Оплата доски"
      className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-glass-brd px-3 py-2 text-sm"
    >
      <span className="flex items-center gap-1.5 text-text-0">
        <Coins aria-hidden className="size-4 text-text-2" />
        {commercial.clientName || "Коммерческая доска"}
      </span>
      {commercial.lead && (
        <span className="text-text-1">Ведёт: {commercial.lead.name}</span>
      )}
      {commercial.pricingModel === "hourly" &&
        commercial.dailyNormMinutes > 0 && (
          <span className="text-text-1">
            Норма {formatMinutes(commercial.dailyNormMinutes)} в день
          </span>
        )}
      {commercial.pricingModel === "fixed" && (
        <span className="text-text-1">Фикс за задачу</span>
      )}
      {shown && (
        <span className="flex items-center gap-2">
          <span className="font-mono text-text-0">
            {formatMoney(shown.spentMinor, shown.currency)}
            {shown.budgetMinor > 0 &&
              ` из ${formatMoney(shown.budgetMinor, shown.currency)}`}
          </span>
          {spentShare !== null && (
            <span
              className={
                spentShare >= BUDGET_WARN
                  ? "font-semibold text-magenta"
                  : "text-text-2"
              }
            >
              {Math.round(spentShare * 100)}%
            </span>
          )}
          {shown.pendingOvertimeMinutes > 0 && (
            <span className="text-text-1">
              · не одобрено {formatMinutes(shown.pendingOvertimeMinutes)}
            </span>
          )}
        </span>
      )}
      {shown && shown.pendingRequestCount > 0 && (
        <button
          type="button"
          onClick={() => setRequestsOpen(true)}
          className="flex min-h-10 items-center gap-1.5 rounded-lg border border-magenta px-2.5 font-semibold text-magenta"
        >
          <Clock aria-hidden className="size-4" />
          Запросы сверх нормы: {shown.pendingRequestCount}
        </button>
      )}
      {shown && shown.pendingRequestCount === 0 && (
        <button
          type="button"
          onClick={() => setRequestsOpen(true)}
          className="flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-text-1 hover:text-text-0"
        >
          <Clock aria-hidden className="size-4" />
          Запросы
        </button>
      )}
      <button
        type="button"
        onClick={() => setPayoutsOpen(true)}
        className="flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-text-1 hover:text-text-0"
      >
        <CalendarClock aria-hidden className="size-4" />
        Выплаты
      </button>
      {payoutsOpen && (
        <WorkPayoutsDialog
          boardId={board.id}
          onClose={() => setPayoutsOpen(false)}
          onChanged={() => setFinanceVersion((value) => value + 1)}
        />
      )}
      {requestsOpen && (
        <OvertimeRequestsDialog
          boardId={board.id}
          onClose={() => setRequestsOpen(false)}
          onChanged={() => setFinanceVersion((value) => value + 1)}
        />
      )}
      {canEditSettings && (
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="ml-auto flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-text-1 hover:text-text-0"
        >
          <Settings2 aria-hidden className="size-4" />
          Настройки оплаты
        </button>
      )}
      {settingsOpen && (
        <CommercialSettingsDialog
          board={board}
          onClose={() => setSettingsOpen(false)}
          onSaved={(next) => {
            setSettingsOpen(false);
            onChanged(next);
          }}
        />
      )}
    </section>
  );
}

function CommercialSettingsDialog({
  board,
  onClose,
  onSaved,
}: {
  board: WorkBoardDto;
  onClose: () => void;
  onSaved: (board: WorkBoardDto) => void;
}) {
  const id = useId();
  const [commercial, setCommercial] = useState(true);
  const [draft, setDraft] = useState(() => draftFrom(board.commercial));
  const [leadId, setLeadId] = useState(
    board.commercial?.lead?.userId ?? board.viewerId,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasCommercial = board.kind === "commercial";

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    let body: Parameters<typeof updateWorkBoard>[1];
    if (commercial) {
      const settings = commercialDraftToInput(
        draft,
        board.commercial?.timezone ?? browserTimezone(),
      );
      if ("error" in settings) {
        setError(settings.error);
        return;
      }
      body = { commercial: settings.input, leadId };
    } else {
      body = { commercial: null };
    }
    setBusy(true);
    try {
      onSaved(await updateWorkBoard(board.id, body));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не получилось");
      setBusy(false);
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
      <form
        onSubmit={submit}
        className="flex max-h-[90dvh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-2xl bg-sheet p-4 sm:rounded-2xl"
      >
        <div className="flex items-center gap-2">
          <h2
            id={`${id}-title`}
            className="font-display text-base font-semibold text-text-0"
          >
            Оплата доски
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="ml-auto flex size-10 items-center justify-center rounded-lg text-text-1 hover:text-text-0"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        {wasCommercial && (
          <BoardKindChoice commercial={commercial} onChange={setCommercial} />
        )}
        {commercial ? (
          <>
            <CommercialSettingsFields draft={draft} onChange={setDraft} />
            <label className="flex flex-col gap-1" htmlFor={`${id}-lead`}>
              <span className="text-xs text-text-1">Ведущий доски</span>
              <select
                id={`${id}-lead`}
                value={leadId}
                onChange={(event) => setLeadId(event.target.value)}
                aria-describedby={`${id}-lead-hint`}
                className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
              >
                {board.members
                  .filter((member) => member.role !== "viewer")
                  .map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name}
                      {member.isAgent ? " · ИИ" : ""}
                    </option>
                  ))}
              </select>
              <span id={`${id}-lead-hint`} className="text-xs text-text-2">
                Видит все деньги доски и одобряет часы сверх нормы.
                Исполнители видят только свои часы и суммы.
              </span>
            </label>
          </>
        ) : (
          <p className="text-sm text-text-1">
            Доска станет обычной. Часы, ставки и сметы не удалятся — вернутся,
            если снова сделать её коммерческой.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-magenta">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl px-4 py-2 text-sm text-text-1"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-magenta px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
            Сохранить
          </button>
        </div>
      </form>
    </div>
  );
}

/** Панель ведущего: все запросы сверх нормы доски, ждущие сверху (VED-459). */
function OvertimeRequestsDialog({
  boardId,
  onClose,
  onChanged,
}: {
  boardId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const id = useId();
  const [data, setData] = useState<WorkOvertimeRequestsDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getWorkOvertimeRequests(boardId)
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

  async function run(action: () => Promise<WorkOvertimeRequestsDto>) {
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
            Запросы сверх нормы
          </h2>
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
            Загружаем…
          </p>
        ) : data.items.length === 0 ? (
          <p className="text-sm text-text-1">
            Запросов пока нет. Исполнитель просит часы сверх нормы из карточки
            задачи.
          </p>
        ) : (
          <OvertimeRequestList
            items={data.items}
            currency={data.currency}
            canDecide={data.canDecide}
            showTask
            busy={busy}
            onDecide={(requestId, decision, note) =>
              void run(() => decideWorkOvertime(requestId, { decision, note }))
            }
            onCancel={(requestId) =>
              void run(() => cancelWorkOvertime(requestId))
            }
          />
        )}
      </div>
    </div>
  );
}

