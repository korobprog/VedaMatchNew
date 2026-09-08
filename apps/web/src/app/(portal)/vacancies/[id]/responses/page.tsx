import Link from "next/link";

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
    <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
      <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
        Отклики
      </h1>
      <div className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
        <p>Воронка откликов появится здесь совсем скоро.</p>
        <Link href={`/vacancies/${id}`} className="mt-2 inline-block text-text-0 underline">
          К предложению
        </Link>
      </div>
    </main>
  );
}
