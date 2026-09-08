import Link from "next/link";
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
      <div className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
        <p>
          Список откликов со статусами появится здесь совсем скоро. Пока
          статус своего отклика видно на карточке предложения.
        </p>
        <Link href="/vacancies" className="mt-2 inline-block text-text-0 underline">
          К ленте
        </Link>
      </div>
    </main>
  );
}
