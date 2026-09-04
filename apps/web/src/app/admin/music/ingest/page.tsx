import type { Metadata } from "next";
import { MusicAdminTabs } from "@/components/music/admin/admin-tabs";
import { IngestBatchList } from "@/components/music/admin/ingest-batch-list";
import {
  getIngestBatches,
  getMusicAdminSummary,
} from "@/lib/music-admin-api";

export const metadata: Metadata = {
  title: "Пополнение аудиотеки",
  robots: { index: false, follow: false },
};

/**
 * Партии редакционного пополнения.
 *
 * Список рисуется на сервере: он же — первое, что видит редактор, и ждать
 * гидратации ради десятка строк незачем.
 */
export default async function MusicAdminIngestPage() {
  const [summary, batches] = await Promise.all([
    getMusicAdminSummary(),
    getIngestBatches(),
  ]);

  return (
    <>
      <MusicAdminTabs
        active="ingest"
        pendingCount={summary?.pending ?? 0}
        openReports={summary?.openReports ?? 0}
      />

      <p className="mb-5 max-w-2xl text-sm text-text-1">
        Партия — это пачка записей, которую собирают целиком и публикуют одной
        кнопкой. Файлы, ссылки и архив добавляются внутри неё, метаданные
        правятся таблицей, в каталог всё уходит от имени портала.
      </p>

      <IngestBatchList batches={batches ?? []} />
    </>
  );
}
