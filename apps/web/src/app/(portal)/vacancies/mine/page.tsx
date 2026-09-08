import { VacanciesFeedView } from "@/components/vacancies/vacancies-feed-view";
import { VacanciesNav } from "@/components/vacancies/vacancies-nav";

export const metadata = {
  title: "Мои предложения",
  robots: { index: false, follow: false },
};

export default function MyVacanciesPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 pb-28">
      <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
        Мои предложения
      </h1>
      <p className="mb-6 text-sm text-text-1">
        Всё, что вы размещали, — включая скрытое, закрытое и с вышедшим сроком.
      </p>
      <VacanciesNav />
      <VacanciesFeedView mine />
    </main>
  );
}
