import type { MotivationAdminReelFilter } from "@vedamatch/shared";
import { MotivationAdminTabs } from "@/components/motivation/admin/admin-tabs";
import { ReelsBoard } from "@/components/motivation/admin/reels-board";
import { getAdminMotivationReels } from "@/lib/motivation-api";

const FILTERS = new Set<MotivationAdminReelFilter>([
  "all",
  "waiting",
  "rejected",
  "appealed",
  "published",
]);

export default async function AdminMotivationReelsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const filter = FILTERS.has(params.filter as MotivationAdminReelFilter)
    ? (params.filter as MotivationAdminReelFilter)
    : "all";
  const data = await getAdminMotivationReels(filter);

  return (
    <>
      <p className="mb-4 mt-2 max-w-3xl text-sm text-text-1">
        Что принесли участники и что решил ИИ-модератор. Любое его решение можно отменить: отказ
        вернёт рилс в очередь, снятие с публикации уберёт его из ленты, не удаляя у автора.
      </p>
      <MotivationAdminTabs active="reels" />
      <ReelsBoard data={data} filter={filter} />
    </>
  );
}
