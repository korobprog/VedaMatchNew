import { VacanciesNav } from "@/components/vacancies/vacancies-nav";
import { VacancyForm } from "@/components/vacancies/vacancy-form";

export const metadata = {
  title: "Новое предложение",
  robots: { index: false, follow: false },
};

export default function NewVacancyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
        Новое предложение
      </h1>
      <VacanciesNav />
      <VacancyForm />
    </main>
  );
}
