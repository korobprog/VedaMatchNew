import { LibraryAdminTabs } from "@/components/library/admin/admin-tabs";
import { LibraryDuplicateMerge } from "@/components/library/admin/duplicate-merge";
import { LibraryTaxonomyManager } from "@/components/library/admin/taxonomy-manager";
import { LibrarySectionRequests } from "@/components/library/admin/section-requests";
import {
  getLibraryAdminDuplicates,
  getLibraryAdminSectionRequests,
  getLibraryAdminStats,
  getLibraryCategoryTree,
} from "@/lib/library-api";

export const metadata = {
  title: "Образование — рубрики",
  robots: { index: false, follow: false },
};

export default async function AdminLibraryPage() {
  const [stats, duplicates, tree, sectionRequests] = await Promise.all([
    getLibraryAdminStats(),
    getLibraryAdminDuplicates(),
    getLibraryCategoryTree(),
    getLibraryAdminSectionRequests(),
  ]);
  const groups = duplicates ?? [];

  return (
    <>
      <LibraryAdminTabs active="categories" duplicates={groups.length} />

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Записей" value={stats.entries.total} />
          <Tile label="Без обогащения" value={stats.entries.notEnriched} />
          <Tile label="Рубрик" value={stats.categories.active} />
          <Tile label="Верхнего уровня" value={stats.roots} />
        </div>
      )}

      <LibraryTaxonomyManager initialTree={tree ?? []} />

      <h2 className="mb-2 font-display text-lg font-semibold text-text-0">
        Заявки на рубрики верхнего уровня
      </h2>
      <p className="mb-4 max-w-3xl text-sm text-text-1">
        Верхний уровень заводит администрация, поэтому участник, которому не
        нашлось подходящей рубрики, присылает заявку. «Одобрить» заводит
        рубрику названиями из заявки; автор в любом случае получает
        уведомление, так что у отказа стоит указать причину.
      </p>
      <div className="mb-8">
        <LibrarySectionRequests
          initialRequests={sectionRequests?.requests ?? []}
        />
      </div>

      <h2 className="mb-2 font-display text-lg font-semibold text-text-0">
        Дубли рубрик
      </h2>
      <p className="mb-4 max-w-3xl text-sm text-text-1">
        Рубрику заводит любой участник, и проверка похожих при создании только
        предупреждает — одинаковые названия накапливаются сами. Слияние
        переносит записи в оставшуюся рубрику; отменить его нельзя.
      </p>

      <LibraryDuplicateMerge groups={groups} />
    </>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl border border-glass-brd p-4">
      <p className="font-mono text-2xl font-semibold text-text-0">{value}</p>
      <p className="mt-1 text-sm text-text-1">{label}</p>
    </div>
  );
}
