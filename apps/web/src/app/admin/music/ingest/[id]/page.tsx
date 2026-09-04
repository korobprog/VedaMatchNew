import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MusicAdminTabs } from "@/components/music/admin/admin-tabs";
import { IngestBatchForm } from "@/components/music/admin/ingest-batch-form";
import { IngestItems } from "@/components/music/admin/ingest-items-table";
import { IngestSources } from "@/components/music/admin/ingest-sources";
import {
  getIngestBatch,
  getMusicAdminAlbums,
  getMusicAdminArtists,
  getMusicAdminCategories,
  getMusicAdminSummary,
} from "@/lib/music-admin-api";

export const metadata: Metadata = {
  title: "Партия пополнения",
  robots: { index: false, follow: false },
};

/**
 * Страница партии: шапка, три способа добавить записи и таблица позиций.
 *
 * Справочники приходят сюда же — исполнителя и альбом выбирают из готового
 * списка, а не набирают строкой: одна опечатка заводит второго «Аиндра прабху»
 * в каталоге навсегда.
 */
export default async function MusicAdminIngestBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [summary, batch, artists, albums, categories] = await Promise.all([
    getMusicAdminSummary(),
    getIngestBatch(id),
    getMusicAdminArtists(),
    getMusicAdminAlbums(),
    getMusicAdminCategories(),
  ]);

  if (!batch) notFound();

  return (
    <>
      <MusicAdminTabs
        active="ingest"
        pendingCount={summary?.pending ?? 0}
        openReports={summary?.openReports ?? 0}
      />

      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h2 className="font-display text-xl font-bold text-text-0">
          {batch.title}
        </h2>
        <Link
          href="/admin/music/ingest"
          className="text-sm text-text-2 underline underline-offset-2 hover:text-text-0"
        >
          ко всем партиям
        </Link>
      </div>

      <div className="flex flex-col gap-5">
        <IngestBatchForm
          batch={batch}
          artists={artists?.items ?? []}
          albums={albums?.items ?? []}
          categories={categories?.items ?? []}
        />

        {batch.status !== "published" && <IngestSources batchId={batch.id} />}

        <section className="glass flex flex-col gap-3 rounded-2xl border border-glass-brd p-4">
          <h2 className="font-display text-lg font-bold text-text-0">
            Позиции партии
          </h2>
          <IngestItems
            batchId={batch.id}
            items={batch.items}
            artists={artists?.items ?? []}
            albums={albums?.items ?? []}
            defaults={{
              artistId: batch.artistId,
              albumId: batch.albumId,
              categoryIds: batch.categoryIds,
              language: batch.language,
              isLiveRecording: batch.isLiveRecording,
            }}
          />
        </section>
      </div>
    </>
  );
}
