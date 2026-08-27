import { MusicAdminTabs } from "@/components/music/admin/admin-tabs";
import { MusicReferenceForms } from "@/components/music/admin/reference-forms";
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
        <ReferenceList
          title="Исполнители"
          empty="Пока никого."
          rows={artistItems.map((artist) => ({
            id: artist.id,
            primary: artist.name,
            secondary: countLabel(artist.trackCount),
            badge: artist.isVerified ? "проверен" : null,
          }))}
        />
        <ReferenceList
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
        <ReferenceList
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

function ReferenceList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: {
    id: string;
    primary: string;
    secondary: string;
    badge: string | null;
  }[];
}) {
  return (
    <section className="glass rounded-2xl border border-glass-brd p-4">
      <h3 className="mb-3 font-display text-base font-bold text-text-0">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-text-2">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text-0">
                  {row.primary}
                </span>
                <span className="block truncate text-xs text-text-2">
                  {row.secondary}
                </span>
              </span>
              {row.badge && (
                <span className="shrink-0 rounded-full border border-cyan/40 px-2 text-[11px] text-cyan">
                  {row.badge}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
