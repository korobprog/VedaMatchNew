import type { Metadata } from "next";
import { MusicAdminTabs } from "@/components/music/admin/admin-tabs";
import { MusicAudiobooksEditor } from "@/components/music/admin/audiobooks-editor";
import {
  getMusicAdminArtists,
  getMusicAdminAudiobooks,
  getMusicAdminSummary,
} from "@/lib/music-admin-api";

export const metadata: Metadata = {
  title: "Лекции Музыки",
  robots: { index: false, follow: false },
};

/**
 * Редактор раздела «Лекции» (VED-437): тот же редактор, что у аудиокниг, —
 * цикл с лекциями по порядку.
 */
export default async function MusicAdminLecturesPage() {
  const [summary, audiobooks, artists] = await Promise.all([
    getMusicAdminSummary(),
    getMusicAdminAudiobooks(),
    getMusicAdminArtists(),
  ]);

  return (
    <>
      <MusicAdminTabs active="lectures" pendingCount={summary?.pending ?? 0} />

      <p className="mb-5 max-w-2xl text-sm text-text-1">
        Цикл — отдельная единица раздела «Лекции»: название, лектор, обложка и
        лекции по порядку. Лекции — записи каталога: добавьте уже загруженные
        или загрузите новые прямо в цикл. В каталоге Музыки лекции цикла не
        показываются.
      </p>

      <MusicAudiobooksEditor
        kind="lecture"
        books={audiobooks?.books ?? []}
        unassigned={audiobooks?.unassigned ?? []}
        artists={artists?.items ?? []}
      />
    </>
  );
}
