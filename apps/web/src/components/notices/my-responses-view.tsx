"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { NoticeResponseDto } from "@vedamatch/shared";
import {
  NoticesApiError,
  getMyNoticeResponses,
  withdrawNoticeResponse,
} from "@/lib/notices-api";
import { ContactsBlock } from "./notice-contacts-block";

const STATUS_LABELS: Record<NoticeResponseDto["status"], string> = {
  open: "Ждёт ответа",
  accepted: "Принят — контакты открыты",
  declined: "Отклонён",
  withdrawn: "Отозван",
};

export function MyResponsesView() {
  const [items, setItems] = useState<NoticeResponseDto[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getMyNoticeResponses()
      .then((response) => {
        if (!alive) return;
        setItems(response.items);
        setRemaining(response.remainingToday);
      })
      .catch((e: unknown) => {
        if (alive)
          setError(
            e instanceof NoticesApiError ? e.message : "Не удалось загрузить",
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
    setBusy(true);
    setError(null);
    try {
      await withdrawNoticeResponse(id);
      const response = await getMyNoticeResponses();
      setItems(response.items);
      setRemaining(response.remainingToday);
    } catch (e) {
      setError(e instanceof NoticesApiError ? e.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <p className="flex items-center gap-2 text-sm text-text-1">
        <Loader2 className="size-4 animate-spin" /> Загружаем…
      </p>
    );

  return (
    <div>
      {remaining !== null && (
        <p className="mb-4 text-sm text-text-2">
          Сегодня можно отправить ещё откликов: {remaining}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          Вы пока никому не откликались.{" "}
          <Link href="/notices" className="text-text-0 underline">
            Посмотреть доску
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((response) => (
            <li
              key={response.id}
              className="glass rounded-2xl border border-glass-brd p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/notices/${response.noticeId}`}
                  className="font-medium text-text-0 underline"
                >
                  {response.noticeTitle}
                </Link>
                <span className="ml-auto text-xs text-text-2">
                  {STATUS_LABELS[response.status]}
                </span>
              </div>
              {response.message && (
                <p className="mt-2 text-sm text-text-1">{response.message}</p>
              )}
              {response.contacts && (
                <ContactsBlock
                  contacts={response.contacts}
                  label="Как связаться с автором"
                />
              )}
              {response.status === "open" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void withdraw(response.id)}
                  className="mt-3 text-sm text-text-2 hover:text-red-400 disabled:opacity-50"
                >
                  Отозвать отклик
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
