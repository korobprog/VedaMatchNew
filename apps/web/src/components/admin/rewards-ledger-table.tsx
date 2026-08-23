"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  REWARDS_REVOKE_REASON_MAX,
  type AdminRewardsLedgerItemDto,
} from "@vedamatch/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LEDGER_TYPE_LABELS, formatLedgerAmount } from "@/lib/rewards-share";
import { revokeRewardsEntry } from "@/lib/rewards-api";

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "short",
  timeStyle: "short",
});

/**
 * Начисления с отменой. Отмена — отдельная операция со знаком минус, а не
 * удаление строки: в споре с человеком администрации нужно видеть, что
 * начисление было и почему его сняли.
 */
export function RewardsLedgerTable({
  items,
}: {
  items: AdminRewardsLedgerItemDto[];
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke(entryId: string) {
    setPending(true);
    setError(null);
    try {
      await revokeRewardsEntry(entryId, reason);
      setOpenId(null);
      setReason("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отменить");
    } finally {
      setPending(false);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-text-1">Начислений пока нет.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert tone="error">{error}</Alert>}
      {/* Таблица прокручивается внутри себя: на телефоне страница не должна
          ехать вбок целиком. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-glass-brd text-left text-text-1">
              <th className="py-2 pr-3 font-medium">Когда</th>
              <th className="py-2 pr-3 font-medium">Кому</th>
              <th className="py-2 pr-3 font-medium">Операция</th>
              <th className="py-2 pr-3 font-medium">Сумма</th>
              <th className="py-2 font-medium">Действие</th>
            </tr>
          </thead>
          <tbody>
            {items.map((entry) => (
              <tr key={entry.id} className="border-b border-glass-brd">
                <td className="py-2 pr-3 text-text-1">
                  {dateFormat.format(new Date(entry.createdAt))}
                </td>
                <td className="py-2 pr-3 text-text-0">
                  {entry.userName}
                  <span className="block text-xs text-text-1">
                    {entry.userEmail}
                  </span>
                </td>
                <td className="py-2 pr-3 text-text-0">
                  {LEDGER_TYPE_LABELS[entry.type]}
                  {entry.comment && (
                    <span className="block text-xs text-text-1">
                      {entry.comment}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 font-mono text-text-0">
                  {formatLedgerAmount(entry.amount)}
                </td>
                <td className="py-2">
                  {entry.revoked ? (
                    <span className="text-text-1">Отменено</span>
                  ) : entry.amount > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setOpenId(entry.id === openId ? null : entry.id);
                        setReason("");
                      }}
                      aria-expanded={openId === entry.id}
                    >
                      Отменить
                    </Button>
                  ) : (
                    <span className="text-text-1">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openId && (
        <div className="glass rounded-2xl border border-glass-brd p-4">
          <label className="block text-sm font-medium text-text-1">
            Причина отмены
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={REWARDS_REVOKE_REASON_MAX}
              className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
              placeholder="Например: накрутка через второй аккаунт"
            />
          </label>
          <div className="mt-3 flex gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={pending || reason.trim().length === 0}
              onClick={() => void revoke(openId)}
            >
              {pending ? "Отменяем…" : "Отменить начисление"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
              Не надо
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
