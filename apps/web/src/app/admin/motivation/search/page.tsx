import { MotivationAdminTabs } from "@/components/motivation/admin/admin-tabs";
import {
  AuthorWatchList,
  SourceWatchList,
} from "@/components/motivation/admin/watch-lists";
import {
  getAdminMotivationAuthorWatches,
  getAdminMotivationSourceWatches,
} from "@/lib/motivation-api";

export default async function AdminMotivationSearchPage() {
  const [authors, sources] = await Promise.all([
    getAdminMotivationAuthorWatches(),
    getAdminMotivationSourceWatches(),
  ]);

  return (
    <>
      <p className="mb-4 mt-2 max-w-3xl text-sm text-text-1">
        Найденные цитаты попадают в очередь «Цитаты и текст» и требуют обычного
        одобрения.
      </p>
      <MotivationAdminTabs active="search" />
      <div className="space-y-4">
        <AuthorWatchList authors={authors ?? []} />
        <SourceWatchList sources={sources ?? []} />
      </div>
    </>
  );
}
