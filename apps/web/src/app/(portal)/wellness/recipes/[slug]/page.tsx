import { RecipeDetailView } from "@/components/wellness/recipe-detail";
import { WellnessNav } from "@/components/wellness/wellness-nav";

export const metadata = {
  title: "Рецепт — Здоровье",
  robots: { index: false, follow: false },
};

export default async function WellnessRecipePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <WellnessNav />
      <RecipeDetailView slug={slug} />
    </main>
  );
}
