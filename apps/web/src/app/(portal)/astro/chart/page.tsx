import Link from "next/link";
import { redirect } from "next/navigation";
import {
  GRAHA_NAMES,
  NAKSHATRA_NAMES,
  RASHI_NAMES,
} from "@vedamatch/shared";
import { getProfile } from "@/lib/api";
import { getAstroChart, getAstroReadings, getAstroToday } from "@/lib/astro-api";
import { ChartWheel, formatDegrees } from "@/components/astro/chart-wheel";
import { ChartWheelNorth } from "@/components/astro/chart-wheel-north";
import { DashaPanel } from "@/components/astro/dasha-panel";
import { GrahaTable } from "@/components/astro/graha-table";
import { ReadingsAccordion } from "@/components/astro/readings-accordion";
import { TodayCard } from "@/components/astro/today-card";

export const metadata = {
  title: "Карта рождения",
  description: "Ведическая карта рождения: раши, бхавы, накшатры и даши",
};

export default async function AstroChartPage() {
  const [user, chart, readings, today] = await Promise.all([
    getProfile(),
    getAstroChart(),
    getAstroReadings(),
    getAstroToday(),
  ]);
  if (!chart) redirect("/astro");

  const moon = chart.grahas.find((graha) => graha.graha === "moon")!;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      {/*
        Чья это карта — видно сразу. На странице ничего не говорило об этом, и
        она читалась как «какая-то карта»; с появлением сохранённых карт
        других людей это станет прямой двусмысленностью.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt=""
              className="h-11 w-11 shrink-0 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-glass font-display text-lg font-bold text-text-0"
            >
              {(user?.displayName ?? "?").charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="text-2xl font-semibold">Карта рождения</h1>
            {user && <p className="text-sm text-text-2">{user.displayName}</p>}
          </div>
        </div>
        <Link
          href="/astro"
          className="text-sm underline underline-offset-4 text-text-2"
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
        <p className="mt-4 rounded-xl bg-gold/10 px-4 py-3 text-sm">
          Время рождения не указано, поэтому карта построена без лагны и бхав:
          за сутки восходящий знак обходит весь зодиак, и показывать его по
          выдуманному часу было бы вымыслом. Знаки планет и накшатры от часа
          почти не зависят и показаны.
        </p>
      )}

      <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,20rem)_1fr]">
        {/*
          Две карты рядом: южная и северная. Расчёт один, различается способ
          смотреть — школы читают по-разному, и выбирать за человека незачем.
          Северная требует лагны и без времени рождения не рисуется: дома в
          ней и есть сетка.
        */}
        <div className="space-y-6">
          <figure>
            <ChartWheel chart={chart} />
            <figcaption className="mt-2 text-xs text-text-2">
              Южноиндийская: знаки закреплены, дома подписаны числом
            </figcaption>
          </figure>

          {chart.lagna ? (
            <figure>
              <ChartWheelNorth chart={chart} />
              <figcaption className="mt-2 text-xs text-text-2">
                Северноиндийская: дома закреплены, знак в клетке — числом
              </figcaption>
            </figure>
          ) : (
            <p className="text-xs text-text-2">
              Северноиндийская карта строится по домам, а дома считаются от
              лагны — для неё нужно время рождения.
            </p>
          )}
        </div>

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
            <dt className="text-text-2">
              Накшатра {GRAHA_NAMES.moon}
            </dt>
            <dd className="text-base">
              {NAKSHATRA_NAMES[chart.moonNakshatra - 1]}, пада {moon.pada}
            </dd>
          </div>
          {chart.dasha && (
            <div>
              <dt className="text-text-2">Период сейчас</dt>
              <dd className="text-base">
                {GRAHA_NAMES[chart.dasha.currentMahadasha.lord]} —{" "}
                {GRAHA_NAMES[chart.dasha.currentAntardasha.lord]}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-text-2">Аянамша</dt>
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

      <p className="mt-10 text-sm text-text-2">
        Материалы сервиса предназначены для самопознания и размышления и не
        заменяют медицинскую, юридическую или финансовую консультацию.
      </p>
    </main>
  );
}
