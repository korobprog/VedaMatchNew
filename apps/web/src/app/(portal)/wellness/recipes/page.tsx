import { RecipesView } from "@/components/wellness/recipes-view";
import { WellnessNav } from "@/components/wellness/wellness-nav";

export const metadata = {
  title: "Рецепты — Здоровье",
  description: "Что приготовить из набранного и просто хорошие блюда.",
  robots: { index: false, follow: false },
};

export default function WellnessRecipesPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
      <h1 className="font-display text-2xl font-bold text-text-0">Рецепты</h1>
      <p className="mt-1 mb-6 text-sm text-text-1">
        Вайшнавская кухня: без мяса, рыбы, яиц, лука и чеснока.
      </p>
      <WellnessNav />
      <RecipesView />
    </main>
  );
}
