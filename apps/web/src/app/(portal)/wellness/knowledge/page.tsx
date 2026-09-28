import { KnowledgeHome } from "@/components/wellness/knowledge/knowledge-home";
import { WellnessNav } from "@/components/wellness/wellness-nav";

export const metadata = {
  title: "Знания — Здоровье",
  description: "Архив статей об аюрведе и западной медицине.",
  robots: { index: false, follow: false },
};

export default function WellnessKnowledgePage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 pb-28">
      <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
        Знания
      </h1>
      <p className="mt-1 mb-6 text-sm text-text-1">
        Статьи об аюрведе и западной медицине, разложенные по рубрикам.
      </p>
      <WellnessNav />
      <KnowledgeHome />
    </main>
  );
}
