import { canAdminService } from "@vedamatch/shared";
import { KnowledgeCategory } from "@/components/wellness/knowledge/knowledge-category";
import { WellnessNav } from "@/components/wellness/wellness-nav";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Рубрика — Знания — Здоровье",
  robots: { index: false, follow: false },
};

export default async function WellnessKnowledgeCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, user] = await Promise.all([params, getProfile()]);
  const canEdit = user ? canAdminService(user, "wellness") : false;
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 pb-28">
      <WellnessNav />
      <KnowledgeCategory slug={slug} canEdit={canEdit} />
    </main>
  );
}
