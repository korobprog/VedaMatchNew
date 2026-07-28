"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AdminUserReportDto,
  UserReportReason,
  UserReportStatus,
} from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const reasonLabels: Record<UserReportReason, string> = {
  spam: "Спам или реклама",
  harassment: "Оскорбления, домогательства",
  fake_profile: "Фейковый профиль",
  inappropriate_content: "Недопустимый контент",
  offline_safety: "Небезопасное поведение вне сервиса",
  other: "Другое",
};

const statusLabels: Record<UserReportStatus, string> = {
  open: "Новая",
  reviewed: "Рассмотрена",
  dismissed: "Отклонена",
};

export function AdminReportList({
  reports,
}: {
  reports: AdminUserReportDto[];
}) {
  if (reports.length === 0) {
    return (
      <div className="glass rounded-2xl border border-glass-brd p-8 text-center text-sm text-text-1">
        Жалоб в этой категории нет.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reports.map((report) => (
        <ReportCard key={report.id} report={report} />
      ))}
    </div>
  );
}

function ReportCard({ report }: { report: AdminUserReportDto }) {
  const router = useRouter();
  const [note, setNote] = useState(report.moderatorNote ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(status: UserReportStatus) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/reports/${report.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, moderatorNote: note.trim() || null }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить жалобу");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="glass rounded-2xl border border-glass-brd p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-text-0">
            {reasonLabels[report.reason]}
          </p>
          <p className="text-sm text-text-2">
            На{" "}
            <Link
              href={`/admin/users/${report.target.id}`}
              className="underline hover:text-text-0"
            >
              {report.target.name}
            </Link>{" "}
            · от {report.reporter.name} ·{" "}
            {new Date(report.createdAt).toLocaleString("ru-RU")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {report.targetReportCount > 1 && (
            <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-500">
              Жалоб на пользователя: {report.targetReportCount}
            </span>
          )}
          <span className="rounded-full border border-glass-brd px-2.5 py-1 text-xs text-text-1">
            {statusLabels[report.status]}
          </span>
        </div>
      </div>

      {report.comment && (
        <p className="mb-3 rounded-xl bg-bg-1 p-3 text-sm text-text-1">
          {report.comment}
        </p>
      )}

      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
          Заметка модератора
        </span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={1000}
          className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => update("reviewed")}
          className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Меры приняты
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => update("dismissed")}
          className="rounded-xl glass border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0 disabled:opacity-50"
        >
          Отклонить
        </button>
        {report.status !== "open" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => update("open")}
            className="rounded-xl px-4 py-2 text-sm font-medium text-text-2 hover:text-text-0 disabled:opacity-50"
          >
            Вернуть в новые
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </article>
  );
}
