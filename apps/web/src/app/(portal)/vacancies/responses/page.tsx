import { MyVacancyResponsesView } from "@/components/vacancies/my-responses-view";
import { VacanciesNav } from "@/components/vacancies/vacancies-nav";

export const metadata = {
  title: "Мои отклики",
  robots: { index: false, follow: false },
};

export default function MyVacancyResponsesPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
      <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
        Мои отклики
      </h1>
      <VacanciesNav />
      <MyVacancyResponsesView />
    </main>
  );
}
