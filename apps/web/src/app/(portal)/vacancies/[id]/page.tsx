import { VacancyDetailView } from "@/components/vacancies/vacancy-detail-view";

export const metadata = {
  title: "Предложение",
  robots: { index: false, follow: false },
};

export default async function VacancyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
      <VacancyDetailView id={id} />
    </main>
  );
}
