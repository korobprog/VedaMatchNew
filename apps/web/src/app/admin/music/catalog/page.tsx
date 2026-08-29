import { MusicAdminTabs } from "@/components/music/admin/admin-tabs";
import { MusicReferenceForms } from "@/components/music/admin/reference-forms";
import { MusicReferenceList } from "@/components/music/admin/reference-list";
import { MusicUploadForm } from "@/components/music/upload-form";
import { plural } from "@/lib/plural";
import {
  getMusicAdminAlbums,
  getMusicAdminArtists,
  getMusicAdminCategories,
  getMusicAdminSummary,
} from "@/lib/music-admin-api";

export const metadata = {
  title: "Справочники Музыки",
  robots: { index: false, follow: false },
};

/** Справочники каталога и загрузка записей редакцией. */
export default async function AdminMusicCatalogPage() {
  const [summary, artists, albums, categories] = await Promise.all([
    getMusicAdminSummary(),
    getMusicAdminArtists(),
    getMusicAdminAlbums(),
    getMusicAdminCategories(),
  ]);

  const artistItems = artists?.items ?? [];
  const albumItems = albums?.items ?? [];
  const categoryItems = categories?.items ?? [];

  const countLabel = (n: number) =>
    `${n} ${plural(n, "запись", "записи", "записей")}`;

  return (
    <>
      <MusicAdminTabs active="catalog" pendingCount={summary?.pending ?? 0} />

      <div className="mb-5">
        <MusicUploadForm />
      </div>

      <h2 className="mb-3 font-display text-lg font-bold text-text-0">
        Добавить в справочники
      </h2>
      <MusicReferenceForms artists={artistItems} />

      <h2 className="mb-3 mt-8 font-display text-lg font-bold text-text-0">
        Что уже есть
      </h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <MusicReferenceList
          kind="artist"
          title="Исполнители"
          empty="Пока никого."
          rows={artistItems.map((artist) => ({
            id: artist.id,
            primary: artist.name,
            secondary: countLabel(artist.trackCount),
            badge: artist.isVerified ? "проверен" : null,
          }))}
        />
        <MusicReferenceList
          kind="album"
          title="Программы и альбомы"
          empty="Пока ничего."
          rows={albumItems.map((album) => ({
            id: album.id,
            primary: album.title,
            secondary: [album.artist?.name, album.year, countLabel(album.trackCount)]
              .filter(Boolean)
              .join(" · "),
            badge: null,
          }))}
        />
        <MusicReferenceList
          kind="category"
          title="Разделы каталога"
          empty="Пока пусто."
          rows={categoryItems.map((category) => ({
            id: category.id,
            primary: category.title,
            secondary: countLabel(category.trackCount),
            badge: null,
          }))}
        />
      </div>
    </>
  );
}
