"use client";

import { useId, useState } from "react";
import type {
  WorkCurrency,
  WorkOvertimeRequestDto,
} from "@vedamatch/shared";
import {
  OVERTIME_STATUS_LABEL,
  formatDayRange,
  formatMinutes,
  formatMoney,
} from "./finance-format";

/** Цвет ярлыка по статусу — токенами: ждёт — акцент, решённое — спокойное. */
const STATUS_CLASS: Record<WorkOvertimeRequestDto["status"], string> = {
  pending: "border-magenta text-magenta",
  approved: "border-cyan text-cyan",
  rejected: "border-glass-brd text-text-1",
  cancelled: "border-glass-brd text-text-2",
};

/**
 * Запросы часов сверх нормы (VED-459): одни и те же строки в карточке задачи
 * и в панели ведущего. Решать может ведущий (не свой запрос), отозвать — тот,
 * кто просил, пока запрос ждёт.
 */
export function OvertimeRequestList({
  items,
  currency,
  canDecide,
  showTask,
  busy,
  onDecide,
  onCancel,
}: {
  items: WorkOvertimeRequestDto[];
  currency: WorkCurrency;
  canDecide: boolean;
  /** В панели доски у запроса видна задача; в карточке — нет, она и так ясна. */
  showTask: boolean;
  busy: boolean;
  onDecide: (
    id: string,
    decision: "approved" | "rejected",
    note: string,
  ) => void;
  onCancel: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="divide-y divide-glass-brd rounded-xl border border-glass-brd">
      {items.map((item) => (
        <OvertimeRequestRow
          key={item.id}
          item={item}
          currency={currency}
          canDecide={canDecide && !item.mine && item.status === "pending"}
          showTask={showTask}
          busy={busy}
          onDecide={onDecide}
          onCancel={onCancel}
        />
      ))}
    </ul>
  );
}

function OvertimeRequestRow({
  item,
  currency,
  canDecide,
  showTask,
  busy,
  onDecide,
  onCancel,
}: {
  item: WorkOvertimeRequestDto;
  currency: WorkCurrency;
  canDecide: boolean;
  showTask: boolean;
  busy: boolean;
  onDecide: (
    id: string,
    decision: "approved" | "rejected",
    note: string,
  ) => void;
  onCancel: (id: string) => void;
}) {
  const id = useId();
  const [note, setNote] = useState("");
  return (
    <li className="flex flex-col gap-1 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-text-0">
          {item.person?.name ?? "Удалённый участник"}
        </span>
        <span className="text-text-1">
          {formatMinutes(item.minutesPerDay)} в день ·{" "}
          {formatDayRange(item.fromDay, item.toDay)}
        </span>
        {item.maxCostMinor !== null && (
          <span className="font-mono text-text-0">
            до {formatMoney(item.maxCostMinor, currency)}
          </span>
        )}
        <span
          className={`ml-auto rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[item.status]}`}
        >
          {OVERTIME_STATUS_LABEL[item.status]}
        </span>
      </div>
      {showTask && item.task && (
        <span className="text-text-2">
          {item.task.key} «{item.task.title}»
        </span>
      )}
      {item.reason && <span className="text-text-1">{item.reason}</span>}
      {item.decidedBy && item.status !== "pending" && (
        <span className="text-xs text-text-2">
          {item.decidedBy.name}
          {item.decisionNote ? `: ${item.decisionNote}` : ""}
        </span>
      )}

      {canDecide && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`${id}-note`}>
            Пояснение к решению
          </label>
          <input
            id={`${id}-note`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={300}
            placeholder="Пояснение, если нужно"
            className="min-w-40 flex-1 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide(item.id, "rejected", note)}
            className="min-h-11 rounded-xl px-3 py-2 text-sm text-text-1 hover:text-text-0 disabled:opacity-50"
          >
            Отклонить
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide(item.id, "approved", note)}
            className="min-h-11 rounded-xl bg-magenta px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Одобрить
          </button>
        </div>
      )}
      {item.mine && item.status === "pending" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onCancel(item.id)}
          className="self-start text-xs text-text-1 underline hover:text-text-0 disabled:opacity-50"
        >
          Отозвать запрос
        </button>
      )}
    </li>
  );
}
