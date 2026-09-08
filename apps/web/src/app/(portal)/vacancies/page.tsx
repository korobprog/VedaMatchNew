import { VacanciesFeedView } from "@/components/vacancies/vacancies-feed-view";
import { VacanciesNav } from "@/components/vacancies/vacancies-nav";

export const metadata = {
  title: "Вакансии — работа и служение",
  description:
    "Работа за оплату, служение в храме и ятре, разовые задачи — среди своих.",
  // Внутри — имена, города и условия. Поисковикам здесь делать нечего.
  robots: { index: false, follow: false },
};

export default function VacanciesPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 pb-28">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
          Вакансии
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-text-1">
          Кому нужны руки: работа у преданного-предпринимателя, служение в
          храме или ятре, разовая задача на фестиваль. Откликаются профилем,
          резюме не нужно.
        </p>
      </div>
      <VacanciesNav />
      <VacanciesFeedView />
    </main>
  );
}
