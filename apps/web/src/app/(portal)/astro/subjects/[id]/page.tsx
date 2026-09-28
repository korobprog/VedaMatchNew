import Link from "next/link";
import { notFound } from "next/navigation";
import { GRAHA_NAMES, NAKSHATRA_NAMES, RASHI_NAMES } from "@vedamatch/shared";
import {
  getAstroSubject,
  getAstroSubjectChart,
  getAstroSubjects,
  getAstroTransits,
} from "@/lib/astro-api";
import { formatDegrees } from "@/components/astro/chart-wheel";
import { ChartPanel } from "@/components/astro/chart-panel";
import { DashaPanel } from "@/components/astro/dasha-panel";
import { GrahaTable } from "@/components/astro/graha-table";
import { formatUtcOffset } from "@/components/astro/utc-offset";
import { SubjectCompare } from "@/components/astro/subject-compare";

export const metadata = { title: "Карта записи" };

export default async function AstroSubjectChartPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [subject, chart, all, transits] = await Promise.all([
    getAstroSubject(id),
    getAstroSubjectChart(id),
    getAstroSubjects(),
    getAstroTransits(),
  ]);
  // Чужая запись не находится вовсе — для страницы это обычный 404.
  if (!subject || !chart) notFound();

  const moon = chart.grahas.find((graha) => graha.graha === "moon")!;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{subject.name}</h1>
          <p className="mt-1 text-sm text-text-2">
            {subject.birthDate}
            {subject.birthTime
              ? `, ${subject.birthTime}`
              : ", время неизвестно"}
            {" · "}
            {subject.place.label} · {subject.timezone},{" "}
            {formatUtcOffset(subject.utcOffsetMinutes)}
          </p>
        </div>
        <Link
          href="/astro/subjects"
          className="text-sm text-text-2 underline underline-offset-4"
        >
          Ко всем картам
        </Link>
      </div>

      {subject.nonexistentLocalTime && (
        <p className="mt-3 text-sm text-gold">
          В этот день там переводили стрелки, и указанного часа не существовало.
          Карта построена со сдвигом на час вперёд — уточните время, если можно.
        </p>
      )}

      <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,20rem)_1fr]">
        <ChartPanel chart={chart} transits={transits} />

        <dl className="space-y-3 text-sm">
          {chart.lagna && (
            <div>
              <dt className="text-text-2">Лагна</dt>
              <dd className="text-base">
                {RASHI_NAMES[chart.lagna.rashi - 1]}{" "}
                {formatDegrees(chart.lagna.longitude % 30)} ·{" "}
                {NAKSHATRA_NAMES[chart.lagna.nakshatra - 1]}, пада{" "}
                {chart.lagna.pada}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-text-2">Накшатра {GRAHA_NAMES.moon}</dt>
            <dd className="text-base">
              {NAKSHATRA_NAMES[moon.nakshatra - 1]}, пада {moon.pada}
            </dd>
          </div>
          <div>
            <dt className="text-text-2">Аянамша</dt>
            <dd className="text-base">Лахири {formatDegrees(chart.ayanamsa)}</dd>
          </div>
        </dl>
      </div>

      {subject.notes && (
        <section className="mt-10">
          <h2 className="text-lg font-medium">Заметки</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-text-1">
            {subject.notes}
          </p>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-medium">Сверить с другой картой</h2>
        <div className="mt-3">
          <SubjectCompare
            subjectId={subject.id}
            others={(all?.items ?? [])
              .filter((other) => other.id !== subject.id)
              .map((other) => ({ id: other.id, name: other.name }))}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Положения грах</h2>
        <div className="mt-3">
          <GrahaTable chart={chart} />
        </div>
      </section>

      {chart.dasha && (
        <section className="mt-10">
          <h2 className="text-lg font-medium">Вимшоттари-даша</h2>
          <div className="mt-3">
            <DashaPanel dasha={chart.dasha} />
          </div>
        </section>
      )}

      <p className="mt-10 text-sm text-text-2">
        Материалы сервиса предназначены для самопознания и размышления и не
        заменяют медицинскую, юридическую или финансовую консультацию.
      </p>
    </main>
  );
}
