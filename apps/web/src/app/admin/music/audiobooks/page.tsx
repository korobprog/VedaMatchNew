import type { Metadata } from "next";
import { MusicAdminTabs } from "@/components/music/admin/admin-tabs";
import { MusicAudiobooksEditor } from "@/components/music/admin/audiobooks-editor";
import {
  getMusicAdminArtists,
  getMusicAdminAudiobooks,
  getMusicAdminSummary,
} from "@/lib/music-admin-api";

export const metadata: Metadata = {
  title: "Аудиокниги Музыки",
  robots: { index: false, follow: false },
};

/**
 * Редактор аудиокниг (VED-297). Каждая книга — самостоятельная единица с
 * главами по порядку; раздел «Аудиокниги» на витрине показывает только
 * опубликованные книги с опубликованными главами.
 */
export default async function MusicAdminAudiobooksPage() {
  const [summary, audiobooks, artists] = await Promise.all([
    getMusicAdminSummary(),
    getMusicAdminAudiobooks(),
    getMusicAdminArtists(),
  ]);

  return (
    <>
      <MusicAdminTabs
        active="audiobooks"
        pendingCount={summary?.pending ?? 0}
      />

      <p className="mb-5 max-w-2xl text-sm text-text-1">
        Книга — отдельная единица раздела «Аудиокниги»: название, автор,
        чтец, обложка и главы по порядку. Главы — записи каталога: добавьте
        уже загруженные или загрузите новые прямо в книгу. В каталоге Музыки главы
        не показываются.
      </p>

      <MusicAudiobooksEditor
        books={audiobooks?.books ?? []}
        unassigned={audiobooks?.unassigned ?? []}
        artists={artists?.items ?? []}
      />
    </>
  );
}
