import { LibraryAdminTabs } from "@/components/library/admin/admin-tabs";
import { LibraryDuplicateMerge } from "@/components/library/admin/duplicate-merge";
import {
  getLibraryAdminDuplicates,
  getLibraryAdminStats,
} from "@/lib/library-api";

export const metadata = {
  title: "Образование — категории",
  robots: { index: false, follow: false },
};

export default async function AdminLibraryPage() {
  const [stats, duplicates] = await Promise.all([
    getLibraryAdminStats(),
    getLibraryAdminDuplicates(),
  ]);
  const groups = duplicates ?? [];

  return (
    <>
      <LibraryAdminTabs active="categories" duplicates={groups.length} />

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Записей" value={stats.entries.total} />
          <Tile label="Без обогащения" value={stats.entries.notEnriched} />
          <Tile label="Категорий" value={stats.categories.active} />
          <Tile label="Слито" value={stats.categories.merged} />
        </div>
      )}

      <h2 className="mb-2 font-display text-lg font-semibold text-text-0">
        Дубли категорий
      </h2>
      <p className="mb-4 max-w-3xl text-sm text-text-1">
        Категорию заводит любой участник, и проверка похожих при создании только
        предупреждает — одинаковые названия накапливаются сами. Слияние
        переносит записи в оставшуюся категорию; отменить его нельзя.
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
