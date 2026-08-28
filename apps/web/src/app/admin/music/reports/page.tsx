import type { Metadata } from "next";
import { MusicAdminTabs } from "@/components/music/admin/admin-tabs";
import { MusicReportCard } from "@/components/music/admin/report-card";
import {
  getMusicAdminReports,
  getMusicAdminSummary,
} from "@/lib/music-admin-api";

export const metadata: Metadata = {
  title: "Жалобы на записи",
  robots: { index: false, follow: false },
};

/**
 * Разбор жалоб.
 *
 * Отдельно от очереди модерации, и это не дублирование: очередь показывает
 * `pending` — то, что ещё никто не слышал. Запись, скрытую по жалобам, в
 * `pending` не переводят никогда, и до этой страницы она выпадала из поля
 * зрения насовсем: счётчик открытых жалоб в сводке был, а открыть его было
 * нечем.
 */
export default async function MusicAdminReportsPage() {
  const [summary, reports] = await Promise.all([
    getMusicAdminSummary(),
    getMusicAdminReports(),
  ]);

  const items = reports?.items ?? [];

  return (
    <>
      <MusicAdminTabs
        active="reports"
        pendingCount={summary?.pending ?? 0}
        openReports={items.length}
      />

      <p className="mb-5 max-w-2xl text-sm text-text-1">
        Записи по этим жалобам уже скрыты — порог сработал сам. Решение здесь
        либо оставляет их скрытыми, либо возвращает в каталог. Удаления нет:
        три аккаунта не должны становиться кнопкой «удалить чужое». Без решения
        за неделю запись возвращается автору сама.
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-text-1">Открытых жалоб нет.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((report) => (
            <li key={report.id}>
              <MusicReportCard report={report} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
