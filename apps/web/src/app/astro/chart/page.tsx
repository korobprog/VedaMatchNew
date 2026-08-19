import Link from "next/link";
import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import {
  GRAHA_NAMES,
  NAKSHATRA_NAMES,
  RASHI_NAMES,
} from "@vedamatch/shared";
import { getProfile } from "@/lib/api";
import { getAstroChart, getAstroReadings, getAstroToday } from "@/lib/astro-api";
import { ChartWheel, formatDegrees } from "@/components/astro/chart-wheel";
import { DashaPanel } from "@/components/astro/dasha-panel";
import { GrahaTable } from "@/components/astro/graha-table";
import { ReadingsAccordion } from "@/components/astro/readings-accordion";
import { TodayCard } from "@/components/astro/today-card";

export const metadata = {
  title: "Карта рождения",
  description: "Ведическая карта рождения: раши, бхавы, накшатры и даши",
};

export default async function AstroChartPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/astro/chart");

  const [chart, readings, today] = await Promise.all([
    getAstroChart(),
    getAstroReadings(),
    getAstroToday(),
  ]);
  if (!chart) redirect("/astro");

  const moon = chart.grahas.find((graha) => graha.graha === "moon")!;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Карта рождения</h1>
        <Link
          href="/astro"
          className="text-sm underline underline-offset-4 text-black/60 dark:text-white/60"
        >
          Изменить данные
        </Link>
      </div>

      {today && (
        <div className="mt-6">
          <TodayCard today={today} />
        </div>
      )}

      {chart.timeAccuracy === "unknown" && (
        <p className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm">
          Время рождения не указано, поэтому карта построена без лагны и бхав:
          за сутки восходящий знак обходит весь зодиак, и показывать его по
          выдуманному часу было бы вымыслом. Знаки планет и накшатры от часа
          почти не зависят и показаны.
        </p>
      )}

      <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,20rem)_1fr]">
        <div>
          <ChartWheel chart={chart} />
        </div>

        <dl className="space-y-3 text-sm">
          {chart.lagna && (
            <div>
              <dt className="text-black/60 dark:text-white/60">Лагна</dt>
              <dd className="text-base">
                {RASHI_NAMES[chart.lagna.rashi - 1]}{" "}
                {formatDegrees(chart.lagna.longitude % 30)} ·{" "}
                {NAKSHATRA_NAMES[chart.lagna.nakshatra - 1]}, пада{" "}
                {chart.lagna.pada}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-black/60 dark:text-white/60">
              Накшатра {GRAHA_NAMES.moon}
            </dt>
            <dd className="text-base">
              {NAKSHATRA_NAMES[chart.moonNakshatra - 1]}, пада {moon.pada}
            </dd>
          </div>
          {chart.dasha && (
            <div>
              <dt className="text-black/60 dark:text-white/60">Период сейчас</dt>
              <dd className="text-base">
                {GRAHA_NAMES[chart.dasha.currentMahadasha.lord]} —{" "}
                {GRAHA_NAMES[chart.dasha.currentAntardasha.lord]}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-black/60 dark:text-white/60">Аянамша</dt>
            <dd className="text-base">
              Лахири {formatDegrees(chart.ayanamsa)}
            </dd>
          </div>
        </dl>
      </div>

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

      {readings && (
        <section className="mt-10">
          <ReadingsAccordion initial={readings} />
        </section>
      )}

      <p className="mt-10 text-sm text-black/50 dark:text-white/50">
        Материалы сервиса предназначены для самопознания и размышления и не
        заменяют медицинскую, юридическую или финансовую консультацию.
      </p>
    </main>
  );
}
