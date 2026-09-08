"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { VacancyResponseDto } from "@vedamatch/shared";
import {
  VacanciesApiError,
  getMyVacancyResponses,
  withdrawVacancyResponse,
} from "@/lib/vacancies-api";
import {
  VACANCY_KIND_CHIPS,
  VACANCY_KIND_CHIP_STYLE,
  VACANCY_RESPONSE_STATUS_LABELS,
  formatDate,
} from "./vacancy-labels";

/** «Куда я откликнулся»: статусы, диалог с автором, отзыв отклика. */
export function MyVacancyResponsesView() {
  const [items, setItems] = useState<VacancyResponseDto[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getMyVacancyResponses()
      .then((response) => {
        if (!alive) return;
        setItems(response.items);
        setRemaining(response.remainingToday);
      })
      .catch((e: unknown) => {
        if (alive)
          setError(
            e instanceof VacanciesApiError ? e.message : "Не удалось загрузить",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const withdraw = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await withdrawVacancyResponse(id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (e) {
      setError(e instanceof VacanciesApiError ? e.message : "Не получилось");
    } finally {
      setBusyId(null);
    }
  };

  if (loading)
    return (
      <p className="flex items-center gap-2 text-sm text-text-1">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Загружаем…
      </p>
    );

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}
      {items.length === 0 ? (
        <div className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          <p>
            Вы пока никуда не откликались.{" "}
            <Link href="/vacancies" className="text-text-0 underline">
              К ленте
            </Link>
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="glass rounded-2xl border border-glass-brd p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${VACANCY_KIND_CHIP_STYLE[item.offerKind]}`}
                >
                  {VACANCY_KIND_CHIPS[item.offerKind]}
                </span>
                <Link
                  href={`/vacancies/${item.offerId}`}
                  className="min-w-0 flex-1 truncate font-medium text-text-0 underline"
                >
                  {item.offerTitle}
                </Link>
                <span className="text-xs text-text-1">
                  {VACANCY_RESPONSE_STATUS_LABELS[item.status]}
                </span>
              </div>
              <p className="mt-1 text-xs text-text-2">
                Отклик от {formatDate(item.createdAt)}
                {item.respondedAt && ` · ответ ${formatDate(item.respondedAt)}`}
              </p>
              {item.message && (
                <p className="mt-2 text-sm text-text-1">{item.message}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/chat/with/${item.offerAuthorId}`}
                  className="rounded-lg border border-glass-brd px-3 py-1 text-xs text-text-1 hover:text-text-0"
                >
                  Открыть диалог
                </Link>
                {(item.status === "new" || item.status === "in_dialog") && (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void withdraw(item.id)}
                    className="rounded-lg border border-glass-brd px-3 py-1 text-xs text-text-2 hover:text-text-0 disabled:opacity-50"
                  >
                    Отозвать
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {remaining !== null && (
        <p className="text-xs text-text-2">
          Откликов на сегодня осталось: {remaining}
        </p>
      )}
    </div>
  );
}
