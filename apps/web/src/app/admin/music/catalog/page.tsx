import { MusicAdminTabs } from "@/components/music/admin/admin-tabs";
import { MusicReferenceForms } from "@/components/music/admin/reference-forms";
import { MusicReferenceList } from "@/components/music/admin/reference-list";
import { MusicTrackList } from "@/components/music/admin/track-list";
import { MusicUploadForm } from "@/components/music/upload-form";
import { Alert } from "@/components/ui/alert";
import { plural } from "@/lib/plural";
import {
  getMusicAdminAlbums,
  getMusicAdminArtists,
  getMusicAdminCategories,
  getMusicAdminSummary,
  getMusicAdminTracks,
} from "@/lib/music-admin-api";

export const metadata = {
  title: "Справочники Музыки",
  robots: { index: false, follow: false },
};

/** Справочники каталога и загрузка записей редакцией. */
export default async function AdminMusicCatalogPage() {
  const [summary, artists, albums, categories, tracks] = await Promise.all([
    getMusicAdminSummary(),
    getMusicAdminArtists(),
    getMusicAdminAlbums(),
    getMusicAdminCategories(),
    getMusicAdminTracks(),
  ]);

  /* Ни один список не приехал — это не пустой каталог.
     `adminGet` отдаёт `null` и на 401/403/404, и молча: раньше страница в
     этом случае рисовала «Пока никого» во всех трёх справочниках, и
     отсутствие прав или упавший API выглядели точно так же, как чистая база.
     Именно так читалось «управление музыкой полностью нерабочее». */
  const nothingLoaded =
    !artists && !albums && !categories && !tracks && !summary;

  const artistItems = artists?.items ?? [];
  const albumItems = albums?.items ?? [];
  const categoryItems = categories?.items ?? [];

  const countLabel = (n: number) =>
    `${n} ${plural(n, "запись", "записи", "записей")}`;

  return (
    <>
      <MusicAdminTabs active="catalog" pendingCount={summary?.pending ?? 0} />

      {nothingLoaded && (
        <div className="mb-5">
          <Alert tone="error">
            Справочники не загрузились. Либо у этой учётной записи нет прав на
            раздел «Музыка», либо API ответил ошибкой — пустые списки ниже не
            значат, что каталог пуст.
          </Alert>
        </div>
      )}

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

      <h2 className="mb-3 mt-8 font-display text-lg font-bold text-text-0">
        Записи
      </h2>
      <div className="mb-6">
        <MusicTrackList
          tracks={tracks?.items ?? []}
          total={tracks?.total ?? 0}
          artists={artistItems}
          albums={albumItems}
          categories={categoryItems}
        />
      </div>
    </>
  );
}
