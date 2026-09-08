import { VacancyEditView } from "@/components/vacancies/vacancy-edit-view";

export const metadata = {
  title: "Правка предложения",
  robots: { index: false, follow: false },
};

export default async function EditVacancyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
        Правка предложения
      </h1>
      <VacancyEditView id={id} />
    </main>
  );
}
