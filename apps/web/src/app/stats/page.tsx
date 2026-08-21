import Link from "next/link";
import { Header } from "@/components/header";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { RegistrationsChart } from "@/components/stats/registrations-chart";
import { DonateButton } from "@/components/donate-sheet";
import { stageLabels } from "@/lib/admin-labels";
import { getDonationSettings, getPortalStats } from "@/lib/api";
import { requireUser } from "@/lib/require-user";

export const metadata = {
  title: "Статистика портала",
  robots: { index: false, follow: false },
};

export default async function StatsPage() {
  const user = await requireUser();
  const [stats, donation] = await Promise.all([
    getPortalStats(),
    getDonationSettings(),
  ]);
  if (!stats) throw new Error("Не удалось загрузить статистику");

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8 pb-24">
        <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
          Нас становится больше
        </h1>
        <p className="mb-8 mt-1 text-sm text-text-1">
          Живые числа портала: сколько нас, откуда мы и как прибавляется. Ничего
          придуманного — всё считается прямо сейчас.
        </p>

        <section className="mb-10" aria-labelledby="people">
          <h2 id="people" className="sr-only">
            Люди
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Всего участников" value={stats.people.total} />
            <Tile label="Были на неделе" value={stats.people.activeLast7Days} />
            <Tile label="Пришли за месяц" value={stats.people.newLast30Days} />
            <Tile label="Общин на портале" value={stats.communities} />
          </div>
        </section>

        <section className="mb-10" aria-labelledby="stages">
          <h2
            id="stages"
            className="mb-3 font-display text-lg font-semibold text-text-0"
          >
            Кто с нами
          </h2>
          <ul className="space-y-2">
            {stats.stages.map((row) => (
              <li
                key={row.stage ?? "none"}
                className="glass flex items-center justify-between gap-4 rounded-2xl border border-glass-brd p-3"
              >
                <span className="text-sm text-text-0">
                  {row.stage ? stageLabels[row.stage] : "Этап не выбран"}
                </span>
                <span className="font-mono text-sm font-semibold text-text-0">
                  {row.count}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-10" aria-labelledby="cities">
          <h2
            id="cities"
            className="mb-3 font-display text-lg font-semibold text-text-0"
          >
            Откуда мы
          </h2>
          {stats.cities.length === 0 && stats.otherCitiesPeople === 0 ? (
            <p className="text-sm text-text-2">
              Пока никто не указал город.{" "}
              <Link
                href="/profile"
                className="underline underline-offset-2 hover:text-text-0"
              >
                Укажите свой
              </Link>{" "}
              — и на карте портала станет на город больше.
            </p>
          ) : (
            <>
              <ul className="flex flex-wrap gap-2">
                {stats.cities.map((row) => (
                  <li
                    key={row.city}
                    className="rounded-full border border-glass-brd px-3 py-1 text-sm text-text-1"
                  >
                    {row.city}
                    <span className="ml-2 font-mono text-text-2">
                      {row.count}
                    </span>
                  </li>
                ))}
              </ul>
              {stats.otherCitiesPeople > 0 && (
                <p className="mt-2 text-sm text-text-2">
                  Ещё {stats.otherCitiesPeople} человек — в городах, где нас
                  пока меньше трёх. Такие города не показываем отдельно: при
                  небольшом портале это почти имя и фамилия.
                </p>
              )}
            </>
          )}
        </section>

        <section className="mb-10" aria-labelledby="growth">
          <h2
            id="growth"
            className="mb-3 font-display text-lg font-semibold text-text-0"
          >
            Как прибавляется
          </h2>
          <div className="glass rounded-2xl border border-glass-brd p-4">
            <p className="mb-3 text-sm text-text-1">За последние 30 дней</p>
            <RegistrationsChart
              points={stats.registrationsByDay}
              granularity="day"
            />
          </div>
          <div className="glass mt-3 rounded-2xl border border-glass-brd p-4">
            <p className="mb-3 text-sm text-text-1">По месяцам за год</p>
            <RegistrationsChart
              points={stats.registrationsByMonth}
              granularity="month"
            />
          </div>
        </section>

        {/* Кнопка сама решает, показываться ли: без включённых пожертвований
            и реквизитов она не рисуется, и просить не за что. */}
        <section className="glass rounded-2xl border border-glass-brd p-4">
          <h2 className="font-display text-lg font-semibold text-text-0">
            Портал живёт на пожертвования
          </h2>
          <p className="mb-4 mt-1 text-sm text-text-1">
            Хостинг, домен и генерация иллюстраций стоят денег. Рекламы здесь
            нет и не будет.
          </p>
          <DonateButton donation={donation} />
        </section>
      </main>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl border border-glass-brd p-4">
      <p className="font-mono text-2xl font-semibold text-text-0">{value}</p>
      <p className="mt-1 text-sm text-text-1">{label}</p>
    </div>
  );
}
