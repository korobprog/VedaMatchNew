import { VacancyResponsesView } from "@/components/vacancies/vacancy-responses-view";

export const metadata = {
  title: "Отклики на предложение",
  robots: { index: false, follow: false },
};

export default async function VacancyResponsesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 pb-28">
      <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
        Отклики
      </h1>
      <VacancyResponsesView offerId={id} />
    </main>
  );
}
