import { canAdminService } from "@vedamatch/shared";
import { KnowledgeArticle } from "@/components/wellness/knowledge/knowledge-article";
import { WellnessNav } from "@/components/wellness/wellness-nav";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Статья — Знания — Здоровье",
  robots: { index: false, follow: false },
};

export default async function WellnessKnowledgeArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, user] = await Promise.all([params, getProfile()]);
  const canEdit = user ? canAdminService(user, "wellness") : false;
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <WellnessNav />
      <KnowledgeArticle id={id} canEdit={canEdit} />
    </main>
  );
}
