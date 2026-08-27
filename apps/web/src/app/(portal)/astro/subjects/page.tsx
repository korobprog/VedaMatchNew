import Link from "next/link";
import { getAstroSubjects } from "@/lib/astro-api";
import { SubjectsView } from "@/components/astro/subjects-view";

export const metadata = {
  title: "Мои карты",
  description: "Карты людей, которых вы ведёте: имя, дата, время и место рождения",
};

export default async function AstroSubjectsPage() {
  const subjects = await getAstroSubjects();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Мои карты</h1>
        <Link
          href="/astro"
          className="text-sm text-text-2 underline underline-offset-4"
        >
          Своя карта
        </Link>
      </div>

      <p className="mt-2 max-w-2xl text-text-1">
        Карты людей, которых вы ведёте. Записи видите только вы: они не
        связываются с профилями портала и не участвуют в подборе. Если человек
        тоже участник, карты сверяются обычным путём — по взаимному согласию.
      </p>

      <div className="mt-8">
        <SubjectsView initial={subjects?.items ?? []} />
      </div>
    </main>
  );
}
