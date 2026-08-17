"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type {
  AdminNoticeReportDto,
  NoticeReportReason,
} from "@vedamatch/shared";
import {
  NoticesApiError,
  decideNoticeReport,
  getAdminNoticeReports,
} from "@/lib/notices-api";

const REASON_LABELS: Record<NoticeReportReason, string> = {
  spam: "Спам",
  commercial: "Коммерция",
  mlm: "Сетевой маркетинг",
  duplicate: "Дубль",
  scam: "Обман",
  inappropriate_content: "Неуместное",
  wrong_rubric: "Не та рубрика",
  other: "Другое",
};

export function AdminNoticeReportsView() {
  const [items, setItems] = useState<AdminNoticeReportDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getAdminNoticeReports("open")
      .then((response) => {
        if (alive) setItems(response.items);
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

  const decide = async (
    id: string,
    decision: "hide" | "dismiss" | "suggest_market" | "restore",
  ) => {
    setBusyId(id);
    setError(null);
    try {
      await decideNoticeReport(id, { decision });
      const response = await getAdminNoticeReports("open");
      setItems(response.items);
    } catch (e) {
      setError(e instanceof NoticesApiError ? e.message : "Не получилось");
    } finally {
      setBusyId(null);
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
      {error && (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          Открытых жалоб нет.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((report) => (
            <li
              key={report.id}
              className="glass rounded-2xl border border-glass-brd p-4"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <Link
                  href={`/notices/${report.noticeId}`}
                  className="font-medium text-text-0 underline"
                >
                  {report.noticeTitle}
                </Link>
                <span className="rounded-full border border-glass-brd px-2 py-0.5 text-xs text-text-1">
                  {REASON_LABELS[report.reason]}
                </span>
                <span className="text-xs text-text-2">
                  статус объявления: {report.noticeStatus}
                </span>
              </div>

              {/* Мирские имена: по духовному не понять, кто перед тобой. */}
              <p className="mt-1 text-xs text-text-2">
                пожаловался {report.reporterName} · автор {report.authorName}
              </p>

              {report.note && (
                <p className="mt-2 text-sm text-text-1">{report.note}</p>
              )}

              {report.commerceHits.length > 0 && (
                <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-300">
                  Автопроверка нашла: {report.commerceHits.join(", ")}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === report.id}
                  onClick={() => decide(report.id, "suggest_market")}
                  className="rounded-lg border border-amber-400/40 px-3 py-1.5 text-sm text-amber-300 disabled:opacity-50"
                >
                  Предложить перенести в Рынок
                </button>
                <button
                  type="button"
                  disabled={busyId === report.id}
                  onClick={() => decide(report.id, "hide")}
                  className="rounded-lg border border-red-400/30 px-3 py-1.5 text-sm text-red-400 disabled:opacity-50"
                >
                  Снять объявление
                </button>
                <button
                  type="button"
                  disabled={busyId === report.id}
                  onClick={() => decide(report.id, "restore")}
                  className="rounded-lg border border-emerald-400/40 px-3 py-1.5 text-sm text-emerald-400 disabled:opacity-50"
                >
                  Вернуть в ленту
                </button>
                <button
                  type="button"
                  disabled={busyId === report.id}
                  onClick={() => decide(report.id, "dismiss")}
                  className="rounded-lg border border-glass-brd px-3 py-1.5 text-sm text-text-1 disabled:opacity-50"
                >
                  Жалоба необоснованна
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
